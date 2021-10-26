var fs = require('fs')

module.exports = function(opts){
	var ret = {}

	var _state = {}
	var STATEFILE = opts.persist
	
	try {
		var rawdata = fs.readFileSync(STATEFILE);
		_state = JSON.parse(rawdata);
		if(!opts.namespace in _state)
			_state[opts.namespace] = {}
	} catch(require_state_file_ex) {
		_state[opts.namespace] = {}
	}

	ret.get = function(key, def, cb) {
		if(key in _state[opts.namespace])
			return cb(null, _state[opts.namespace][key])
		else
			return cb(null, def)
	}
	ret.set = function(key, value, cb) {
		_state[opts.namespace][key] = value
		fs.writeFile(STATEFILE, JSON.stringify(_state, null, '\t'), cb)
	}
	return ret
}
