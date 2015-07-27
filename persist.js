module.exports = function(STATEFILE){
	var ret = {}

	var _state
	try {
		_state = require(STATEFILE)
	} catch(require_state_file_ex) {
		_state = {}
	}

	ret.get = function(key, def, cb) {
		if(key in _state)
			return cb(null, _state[key])
		else
			return cb(null, def)
	}
	ret.set = function(key, value, cb) {
		_state[key] = value
		fs.writeFile(STATEFILE, JSON.stringify(_state, null, '\t', cb))
	}
	return ret
}