var request = require('request').defaults({json:true})
var extend = require('extend')
var deepequal = require('deepequal')

module.exports = function(opts){
	var ret = {}
	var LOCAL_DOC_ID = 'couchdb-global-changes:' + opts.namespace


	ret.get = function(db_name, def, cb) {
		var url = opts.couch + db_name + '/_local/' + LOCAL_DOC_ID
		request.get(url, function(err, response, json) {
			// console.log("trying to get", url, err, json)
			if(err || !json || json.error)
				cb(null, def)
			else
				cb(null, json)
		})
	}
	ret.set = function(db_name, value, cb) {
		cb = cb || function() {}

		ret.get(db_name, {}, function(err, local_doc) {

			if(err || !local_doc)
				local_doc = {}

			// check if we are actually changing anything
			// so make a copy of local_doc to compare
			// it before and after patching
			var local_doc_unpatched = {}
			extend(true, local_doc_unpatched, local_doc)
			extend(true, local_doc, value)

			if(deepequal(local_doc_unpatched, local_doc))
				// no need to write, we wouldn't change a thing
				return cb()

			var req = 
				{	method: 'PUT'
				,	url:opts.couch + db_name + '/_local/' + LOCAL_DOC_ID
				,	body: local_doc
				,	qs: {}
				}

			if(local_doc._rev)
				req.qs.rev = local_doc._rev

			request(req, function(err, response, json) {
				if(err)
					cb(err)
				else
					cb()
			})
		})
	}
	return ret
}