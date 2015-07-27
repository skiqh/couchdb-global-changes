var couch_url = 'http://Admin:unreal@localhost:5984'

var couchdb_changes = require('./index.js')

var options = 
    {   couch: couch_url
    ,   filter: '^userdb-'
    }

var feed = couchdb_changes(options)

feed.on('db-change', function(details) {
    console.log('processing document %s / %s', details.db_name, details.change.id)
})
feed.on('progress', function(ratio) {
    var progress = '####################'.substr(0, parseInt(ratio*20, 10))
    process.stderr.write('\033[0G' + progress)
})
feed.on('error', function(err) {
    console.error('something is wrong:', err)
    process.exit()
})