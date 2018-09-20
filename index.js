/*
    log.js - Simple, fast logging

    usage(message, context, operations)

        debug       - Current dev activity
        error       - Any error
        info        - Any non-error information
        trace       - Persistent embedded (disabled by default) internal debug information
        exception   - usage(message, err, context, operations)

    Operations
        alert       - Create Alert record
        bug         - Create a Bug record
        log         - Set to false to disable logging
        notify      - Notify user via email template
                      MOB - would be great to be able to notify via 'chat'
        trail       - Add to account trail

    Operation parameters
        email       - Destination of notification
        expires     - When alert expires
        internal    - Extra internal information never displayed to the user
        message     - If supplied, the original message param becomes params.subject
        priority    - Alert priority
        subject     - Message subject (alert, notice)
        template    - Notification (email) template (implies notify)

    Context Fields
        source      - Originating source module
        time        - Time of event
        type        - debug|error|info|trace
        req         - Request correlation ID
        sessionId   - Cookie session ID
        accountId   - Account ID
        userId      - User ID
        resourceId  - Resource ID
        credId      - Credential ID
        ip          - Client IP address
        instance    - Instance ID
        hostname    - Public DNS hostname
        code        - Error code string
        details     - Extra information not part of the message
 */

export class Log {
    constructor(options, context = {}) {
        this.context = context
        this.options = options
        this.loggers = []
        this.filters = null
        this.top = this
        this.level = 0
        if (options == 'console') {
            this.addLogger(new DefaultLogger)
        }
    }

    child(context) {
        context = Object.assign({}, this.context, context)
        let log = new Log(this.options, context)
        log.loggers = this.loggers.slice(0)
        log.top = this.top
        return log
    }

    addLogger(logger) {
       this.loggers.push(logger)
    }

    setFilter(params) {
        let top = this.top
        top.level = params.level || top.level
        if (!params.filter) {
            return
        }
        top.filters = {}
        if (typeof params.filter == 'string') {
            /*
                --log key=value:level,value:-1/... (Level defaults to 4)
             */
            for (let match of params.filter.split('/')) {
                let [key, values] = match.split('=')
                let item = top.filters[key] = {}
                for (let v of values.split(',')) {
                    let [value, level] = v.split(':')
                    item[value] = level || 4
                }
            }
        } else {
            top.filters = params.filters
        }
        top.filterEntries = Object.entries(top.filters || {})
    }

    addContext(context) {
        this.context = Object.assign(this.context, context)
    }

    /*
        source, message, context
        WARNING: legacy will modify submitted contexts
     */
    legacy(source, context, ops) {
        let message = context
        context = ops || {}
        ops = {}
        for (let field of ['alert', 'bug', 'log', 'notify', 'trail']) {
            if (context[field]) {
                ops[field] = context[field]
                context[field] = undefined
            }
        }
        context.source = source
        context.legacy = true
        return {context, message, ops}
    }

    debug(message, context, ops) {
        if (context != undefined && typeof context == 'string') {
            ({context, ops} = this.legacy(message, context, ops))
        }
        this.submit('debug', message, context, ops)
    }

    error(message, context, ops) {
        if (message.indexOf("Cannot read property 'split'") >= 0) {
            context = context || {}
            context.stack = (new Error(message)).stack
        }
        if (context != undefined && typeof context == 'string') {
            ({context, message, ops} = this.legacy(message, context, ops))
        }
        this.submit('error', message, context, ops)
    }

    exception(message, err, context = {}, ops = {}) {
        context.exception = err
        this.submit('exception', message, context, ops)
    }

    info(message, context, ops) {
        if (context != undefined && typeof context == 'string' && typeof message == 'string') {
            ({context, message, ops} = this.legacy(message, context, ops))
        }
        this.submit('info', message, context, ops)
    }

    trace(message, context = {}, ops = {}) {
        if (context != undefined && typeof context != 'object') {
            ({context, message, ops} = this.legacy(message, context, ops))
        }
        context.level = context.level || 5
        this.submit('trace', message, context, ops)
    }

    submit(type, message, context = {}, ops = {}) {
        if (context.message) {
            context.subject = message
        } else {
            context.message = message
        }
        context.type = type
        context.level = context.level || 0
        this.write({context, ops})
    }

    write(params) {
        this.prep(params)
        for (let logger of this.loggers) {
            logger.write(params)
        }
    }

    prep(params) {
        let {context, ops} = params
        let message = context.message

        if (context instanceof Error) {
            let exception = context
            context = {exception}
            context.message = exception.message

        } else if (message instanceof Error) {
            let exception = message
            context.exception = exception
            context.message = exception.message

        } else if (typeof message != 'string') {
            context.message = JSON.stringify(message)
        }
        if (context.exception) {
            let err = context.exception
            let exception = context.exception = Object.assign({}, err)
            if (err.stack) {
                exception.stack = err.stack.split('\n').map(s => s.trim())
            }
            exception.message = err.message
            exception.code = err.code
        }
        //  MOB - push back into application
        if (context.template) {
            ops.notify = true
        }
        context.time = new Date()
        context.cutoff = this.top.level
        if (Array.isArray(context.message)) {
            context.message = context.message.join(' ')
        }
        params.context = Object.assign({}, this.context, context)
    }

    /*
        Filter is called by Loggers
     */
    filter(params) {
        let top = this.top
        let {context} = params
        let level = top.level

        if (top.filters) {
            for (let [key, item] of top.filterEntries) {
                let thisLevel = (context[key]) ? item[context[key]] : -1
                if (thisLevel < 0) {
                    return false
                } else {
                    level = Math.max(level, thisLevel)
                }
            }
        }
        if (context.level > level) {
            return false
        }
        return true
    }

    addBrowserExceptions() {
        let self = this
        if (typeof window != 'undefined') {
            global.onerror = function(message, source, line, column, err) {
                self.exception(message, err)
            }
            global.onunhandledrejection = (rejection) => {
                let message = `Unhandled promise rejection : ${rejection.message}`
                if (rejection && rejection.reason && rejection.reason.stack) {
                    message += `\r${rejection.reason.stack}`
                }
                self.error(message)
           }
        }
    }

    addNodeExceptions() {
        let self = this
        if (typeof process != 'undefined') {
            process.on("uncaughtException", function(err) {
                self.exception('Uncaught exception', err)
            })
        }
    }
}

export class DefaultLogger {
    write(params) {
        let {context, ops} = params
        let {message, source, type} = context
        if (context.exception) {
            console.log(`${source}: ${type}: ${message}`)
            console.log(context.exception)

        } else if (context.error || context.type == 'trace') {
            console.log(`${source}: ${type}: ${message}`)
            console.log(JSON.stringify(context, null, 4) + '\n')

        } else {
            console.log(`${source}: ${type}: ${message}`)
        }
    }
}
