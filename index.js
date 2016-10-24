/*
    log.js - Simple, fast logging
 */

export class Log {
    constructor(options) {
        global.log = this
        this.loggers = []
        this.output = []
        this.type = { all: true }
        this.from = { all: true }
        if (options == 'console') {
            this.addLogger(new DefaultLogger)
            this.sync = true
        }
    }

    addLogger(logger) {
       this.loggers.push(logger)
    }

    filter(type, from) {
        this.type = {}
        if (type) {
            if (typeof type == 'string') {
                type = [type]
            }
            for (let t of type) {
                this.type[t] = true
            }
        }
        this.from = {}
        if (from) {
            if (typeof from == 'string') {
                from = [from]
            }
            for (let f of from) {
                this.from[f] = true
            }
        }
    }

    debug(from, ...msg) {
        this.write('debug', from, ...msg)
    }

    error(from, ...msg) {
        this.write('error', from, ...msg)
    }

    exception(from, e) {
        this.write('error', from, (e && e.stack) ? e.stack : e)
    }

    info(from, ...msg) {
        this.write('info', from, ...msg)
    }

    trace(from, ...msg) {
        this.write('trace', from, ...msg)
    }

    write(type, from, ...msg) {
        if (!(this.type[type] || this.type.all)) {
            return;
        }
        if (this.type['!' + type]) {
            return;
        }
        if (!(this.from[from] || this.from.all)) {
            return;
        }
        if (this.from['!' + from]) {
            return;
        }
        msg = this.prepMsg(msg)
        this.output.push([type, from, msg])
        if (this.sync) {
            this.flush()
        } else if (!this.scheduled) {
            this.scheduled = true
            let self = this
            if (global.process && global.process.nextTick) {
                process.nextTick(function() {
                    self.flush()
                })
            } else {
                setTimeout(function() {
                    self.flush()
                }, 0)
            }
        }
    }

    flush() {
        this.scheduled = false
        if (this.output.length > 0) {
            try {
                for (let logger of this.loggers) {
                    logger.write(this.output)
                }
            } catch (e) {
                console.log(e)
            }
            this.output = []
        }
    }

    prepMsg(msg) {
        let items = []
        for (let item of msg) {
            if (typeof item == 'string') {
                items.push(item)
            } else if (item instanceof Error) {
                items.push(item.toString())
            } else {
                items.push(JSON.stringify(item, null, 4))
            }
        }
        return items.join(' ')
    }

    addBrowserExceptions() {
        let self = this
        if (typeof window != 'undefined') {
            global.onerror = function(message, source, line, column, error) {
                self.error('callback', message, (error ? error.stack : '') + ' from ' + source  + ':' +
                    line + ':' + column)
            }
            global.onunhandledrejection = (rejection) => {
                let message = `Unhandled promise rejection : ${rejection.message}`
                if (rejection && rejection.reason && rejection.reason.stack) {
                    message += `\r${rejection.reason.stack}`
                }
                self.error('callback', message)
           }
        }
    }

    addNodeExceptions() {
        let self = this
        if (typeof process != 'undefined') {
            process.on("uncaughtException", function(err) {
                self.error('callback', err)
            })
        }
    }
}

export class DefaultLogger {
    write(output) {
        for (let item of output) {
            console.log(item[0], item[1] + ':', item[2])
        }
    }
}
