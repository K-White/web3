/*
 * Copyright (c) 2017-2018 Aion foundation.
 *
 *     This file is part of the aion network project.
 *
 *     The aion network project is free software: you can redistribute it 
 *     and/or modify it under the terms of the GNU General Public License 
 *     as published by the Free Software Foundation, either version 3 of 
 *     the License, or any later version.
 *
 *     The aion network project is distributed in the hope that it will 
 *     be useful, but WITHOUT ANY WARRANTY; without even the implied 
 *     warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  
 *     See the GNU General Public License for more details.
 *
 *     You should have received a copy of the GNU General Public License
 *     along with the aion network project source files.  
 *     If not, see <https://www.gnu.org/licenses/>.
 *
 * Contributors:
 *     Aion foundation.
 *     Marek Kotewicz <marek@parity.io>
 *     Fabian Vogelsteller <fabian@frozeman.de>
 */"use strict";


var _ = require('underscore');
var errors = require('aion-web3-core-helpers').errors;
var Jsonrpc = require('./jsonrpc.js');
var BatchManager = require('./batch.js');
var givenProvider = require('./givenProvider.js');



    /**
 * It's responsible for passing messages to providers
 * It's also responsible for polling the ethereum node for incoming messages
 * Default poll timeout is 1 second
 * Singleton
 */
var RequestManager = function RequestManager(provider) {
    this.provider = null;
    this.providers = RequestManager.providers;

    this.setProvider(provider);
    this.subscriptions = {};
};



RequestManager.givenProvider = givenProvider;

RequestManager.providers = {
    WebsocketProvider: require('aion-web3-providers-ws'),
    HttpProvider: require('aion-web3-providers-http'),
    IpcProvider: require('aion-web3-providers-ipc')
};



/**
 * Should be used to set provider of request manager
 *
 * @method setProvider
 * @param {Object} p
 */
RequestManager.prototype.setProvider = function (p, net) {
    var _this = this;

    // autodetect provider
    if(p && typeof p === 'string' && this.providers) {

        // HTTP
        if(/^http(s)?:\/\//i.test(p)) {
            p = new this.providers.HttpProvider(p);

            // WS
        } else if(/^ws(s)?:\/\//i.test(p)) {
            p = new this.providers.WebsocketProvider(p);

            // IPC
        } else if(p && typeof net === 'object'  && typeof net.connect === 'function') {
            p = new this.providers.IpcProvider(p, net);

        } else if(p) {
            throw new Error('Can\'t autodetect provider for "'+ p +'"');
        }
    }

    // reset the old one before changing, if still connected
    if(this.provider && this.provider.connected)
        this.clearSubscriptions();


    this.provider = p || null;

    // listen to incoming notifications
    if(this.provider && this.provider.on) {
        this.provider.on('data', function requestManagerNotification(result, deprecatedResult){
            result = result || deprecatedResult; // this is for possible old providers, which may had the error first handler

            // check for result.method, to prevent old providers errors to pass as result
            if(result.method && _this.subscriptions[result.params.subscription] && _this.subscriptions[result.params.subscription].callback) {
                _this.subscriptions[result.params.subscription].callback(null, result.params.result);
            }
        });
        // TODO add error, end, timeout, connect??
        // this.provider.on('error', function requestManagerNotification(result){
        //     Object.keys(_this.subscriptions).forEach(function(id){
        //         if(_this.subscriptions[id].callback)
        //             _this.subscriptions[id].callback(err);
        //     });
        // }
    }
};


/**
 * Should be used to asynchronously send request
 *
 * @method sendAsync
 * @param {Object} data
 * @param {Function} callback
 */
RequestManager.prototype.send = function (data, callback) {
    callback = callback || function(){};

    if (!this.provider) {
        return callback(errors.InvalidProvider());
    }

    var payload = Jsonrpc.toPayload(data.method, data.params);
    this.provider[this.provider.sendAsync ? 'sendAsync' : 'send'](payload, function (err, result) {
        if(result && result.id && payload.id !== result.id) return callback(new Error('Wrong response id "'+ result.id +'" (expected: "'+ payload.id +'") in '+ JSON.stringify(payload)));

        if (err) {
            return callback(err);
        }

        if (result && result.error) {
            return callback(errors.ErrorResponse(result));
        }

        if (!Jsonrpc.isValidResponse(result)) {
            return callback(errors.InvalidResponse(result));
        }

        callback(null, result.result);
    });
};

/**
 * Should be called to asynchronously send batch request
 *
 * @method sendBatch
 * @param {Array} batch data
 * @param {Function} callback
 */
RequestManager.prototype.sendBatch = function (data, callback) {
    if (!this.provider) {
        return callback(errors.InvalidProvider());
    }

    var payload = Jsonrpc.toBatchPayload(data);
    this.provider[this.provider.sendAsync ? 'sendAsync' : 'send'](payload, function (err, results) {
        if (err) {
            return callback(err);
        }

        if (!_.isArray(results)) {
            return callback(errors.InvalidResponse(results));
        }

        callback(null, results);
    });
};


/**
 * Waits for notifications
 *
 * @method addSubscription
 * @param {String} id           the subscription id
 * @param {String} name         the subscription name
 * @param {String} type         the subscription namespace (eth, personal, etc)
 * @param {Function} callback   the callback to call for incoming notifications
 */
RequestManager.prototype.addSubscription = function (id, name, type, callback) {
    if(this.provider.on) {
        this.subscriptions[id] = {
            callback: callback,
            type: type,
            name: name
        };

    } else {
        throw errors.NoSubscriptionSupport(this.provider.constructor.name);
    }
};

/**
 * Waits for notifications
 *
 * @method removeSubscription
 * @param {String} id           the subscription id
 * @param {Function} callback   fired once the subscription is removed
 */
RequestManager.prototype.removeSubscription = function (id, callback) {
    var _this = this;

    if(this.subscriptions[id]) {

        this.send({
            method: this.subscriptions[id].type + '_unsubscribe',
            params: [id]
        }, callback);

        // remove subscription
        delete _this.subscriptions[id];
    }
};

/**
 * Should be called to reset the subscriptions
 *
 * @method reset
 */
RequestManager.prototype.clearSubscriptions = function (keepIsSyncing) {
    var _this = this;


    // uninstall all subscriptions
    Object.keys(this.subscriptions).forEach(function(id){
        if(!keepIsSyncing || _this.subscriptions[id].name !== 'syncing')
            _this.removeSubscription(id);
    });


    //  reset notification callbacks etc.
    if(this.provider.reset)
        this.provider.reset();
};

module.exports = {
    Manager: RequestManager,
    BatchManager: BatchManager
};
