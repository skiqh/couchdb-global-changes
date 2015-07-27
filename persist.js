var fs = require('fs')

module.exports = function(STATEFILE){
	var ret = {}

	ret._state
	try {
		ret._state = require(STATEFILE)
	} catch(require_state_file_ex) {
		console.error("require_state_file_ex", require_state_file_ex)
		ret._state = {}
	}

	ret.get = function(key, def, cb) {
		if(key in ret._state)
			return cb(null, ret._state[key])
		else
			return cb(null, def)
	}
	ret.set = function(key, value, cb) {
		ret._state[key] = value
		fs.writeFile(STATEFILE, JSON.stringify(ret._state, null, '\t', cb))
	}
	return ret
}