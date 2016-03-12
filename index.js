/*
    node-log - Simple, fast logging in node
 */

import Fs from 'fs';
import Os from 'os';
import Dates from './dates';

var dates = new Dates

export default class Log {

    constructor(options = {}) {
        this.stream = null
        this.mode = options.mode
        this.output = []
        if (typeof options == 'string') {
            this.path = options
        } else if (options.path) {
            this.path = options.path
        } else {
            this.path = 'stdout'
        }
        this.setTrace(options.trace)
        this.format = options.format
        this.open()
        global.log = this
    }

    open() {
        if (this.path == 'stdout') {
            this.stream = process.stdout
            this.console = true
        } else if (this.path == 'stderr') {
            this.stream = process.stderr
            this.console = true
        } else {
            this.stream = Fs.createWriteStream(this.path)
        }
    }

    close() {
        if (this.stream) {
            this.stream.end('\n')
        }
    }

    setTrace(items) {
        let trace = this.tags = {}
        if (items) {
            if (typeof items == 'string') {
                items = [items]
            }
            for (let item of items) {
                trace[item] = true
            }
        }
    }

    error(...msg) {
        this.write('ERROR', ...msg)
    }

    fatal(...msg) {
        this.write('ERROR', ...msg)
        process.nextTick(function() { print('Exiting ...') ; process.exit(1) })
    }

    info(...msg) {
        this.write('INFO', ...msg)
    }

    trace(mod, ...msg) {
        if (!this.tags || this.tags[mod] || this.tags.all) {
            let items = []
            for (let item of msg) {
                if (typeof item == 'string') {
                    items.push(item)
                } else {
                    items.push(serialize(item, 1))
                }
            }
            this.write(mod.toUpperCase(), items.join(' '))
        }
    }

    write(tag, ...msg) {
        let d = Date()
        let date = d.hour
        let line = msg.join(' ')
        if (this.format) {
            line = this.format.
                replace('%A', app.name).
                replace('%D', dates.format(Date.now(), 'syslog')).
                replace('%H', Os.hostname).
                replace('%P', process.pid).
                replace('%T', tag) + ' ' +
                line
        }
        this.output.push(line)
        if (this.console) {
            console.log(line)
        } else {
            process.nextTick(() => {
                if (this.output.length > 0) {
                    this.stream.write(this.output.join('\n') + '\n')
                    this.stream.cork()
                    this.output = []
                }
            })
        }
    }
}
