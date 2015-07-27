couchdb-global-changes
======================

Does what it says on the tin: emit a `db-change` event for each document change in each db of a couchdb instance.


Usage
-----

```javascript
var couchdb_changes = require('couchdb-global-changes')

var options = 
    {   couch: 'http://user:pass@127.0.0.1'
    ,   filter: '^userdb-'
    }

var feed = couchdb_changes(options)

feed.on('db-change', function(details) {
    console.log('processing %s / %s', details.db_name, details.change.id)
})
feed.on('error', function(err) {
    console.error('something is wrong:', err)
})
```


Details
-------

### Options

* `options.couch`
    * the root url of the couchdb instance
    * defaults to `http://127.0.0.1:5984`
* `options.filter`
    * if provided, will be evaluated as a regular expression
    * each db's name must then match the regular expression
* `options.since` can be one of
    * `'now'` or an integer sequence id: all feeds will use this same value
    * `{ <db1_name>: 'now', <db2_name>: 1234 }`: provide a value for each db's name individually (good for managing resuming operations)
    * defaults to `0` for every feed
* `options.include_docs` can be one of
    * `true` or `false`: all feeds will use this same value
    * `{ <db1_name>: true, <db2_name>: false }`: provide a value for each db's name individually
    * defaults to `false` for every feed

### Functions

* `feed.total_dbs()` returns the number of dbs that are being followed
* `feed.caught_up_dbs()` returns the number of dbs have emitted the `catchup` event

### Events

* `progress` | `function(ratio)`
    * calculated global progress during the catchup-phase.
    * `ratio` goes from 0 to 1

* `catchup` | `function()`
    * all followed dbs have caught up

* `db-progress` | `function(ratio)`
    * calculated progress of a single db during the catchup-phase.
    * `ratio` goes from 0 to 1

* `db-removed` | `function(details)`
    * the db `details.db_name` has been removed from the feed, probably due to deletion of the db

* `db-*` | `function(details)`
    * each of iriscouch's follow event is forwarded with a `db-` prefix
    * the originating db's name is passed as `details.db_name`
    * arguments are passed as `details.<eventname>`
    * Example: the `db-change` event gets passed `{ db_name: 'foo', change: <change-obj> }`
