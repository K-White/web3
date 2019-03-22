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
 */

"use strict"; 

var fs = require('fs');
var ABI = require('aion-web3-avm-abi');

class Contract {

	constructor() {
		this._abi = new ABI();

		this._method = null;
		this._values = [];
		this._types = [];
	}

	deploy(jar) {
		this.args = function(types, values) {
	        return this._abi.encode(types, values);
	    }

	    let jarPath = fs.readFileSync(jar);
		this._constructor = this._abi.readyDeploy(jarPath, args);
	}

	// Sets the Method you wish to Call
    method(method) {
        this._method = method;
        this._values = [];
        this._types = [];
        return this;
    }

    // Sets the Params of the Method you wish to Call
    inputs(types, values) {
        if(this._method === null) {
            throw new Error('a method must be set first');
        }

        this._values = values;
        this._types = types;
        return this;
    }


    // Encodes the Method Call
    encode() {
        if(this._method === null) {
            throw new Error('a method must be set first');
        }

        return this._abi.encodeMethod(this._method, this._types, this._values);
    }

    // Decodes some data returned for a
    decode(type, data) {
        return this._abi.decode(type, data);
    }
}

module.exports = Contract;