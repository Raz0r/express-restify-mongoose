const _ = require('lodash')
const isCoordinates = require('is-coordinates')

module.exports = function (options) {
  const errorHandler = require('../errorHandler')(options)

  function jsonQueryParser (key, value) {
    if (key === '$regex' && !options.allowRegex) {
      return undefined
    }

    if (_.isString(value)) {
      if (value[0] === '~') { // parse RegExp
        return options.allowRegex ? new RegExp(value.substr(1), 'i') : undefined
      } else if (value[0] === '>') {
        if (value[1] === '=') {
          return { $gte: value.substr(2) }
        } else {
          return { $gt: value.substr(1) }
        }
      } else if (value[0] === '<') {
        if (value[1] === '=') {
          return { $lte: value.substr(2) }
        } else {
          return { $lt: value.substr(1) }
        }
      } else if (value[0] === '!' && value[1] === '=') {
        return { $ne: value.substr(2) }
      /* This feature was disabled because it requires MongoDB 3
      } else if (value[0] === '=') {
        return { $eq: value.substr(1) } */
      }
    } else if (_.isArray(value) && key[0] !== '$' && key !== 'coordinates' && !isCoordinates(value)) {
      return { $in: value }
    }

    return value
  }

  function parseQueryOptions (queryOptions) {
    if (queryOptions.select && _.isString(queryOptions.select)) {
      let select = queryOptions.select.split(',')
      queryOptions.select = {}

      for (let i = 0, length = select.length; i < length; i++) {
        if (select[i][0] === '-') {
          queryOptions.select[select[i].substring(1)] = 0
        } else {
          queryOptions.select[select[i]] = 1
        }
      }
    }

    if (queryOptions.deepPopulate) {
      if (_.isString(queryOptions.deepPopulate)) {
        let deepPopulate = queryOptions.deepPopulate.split(',')
        queryOptions.deepPopulate = []

        for (let i = 0, length = deepPopulate.length; i < length; i++) {
          queryOptions.deepPopulate.push({
            path: deepPopulate[i]
          })

          for (let key in queryOptions.select) {
            if (key.indexOf(deepPopulate[i] + '.') === 0) {
              if (queryOptions.deepPopulate[i].select) {
                queryOptions.deepPopulate[i].select += ' '
              } else {
                queryOptions.deepPopulate[i].select = ''
              }

              if (queryOptions.select[key] === 0) {
                queryOptions.deepPopulate[i].select += '-'
              }

              queryOptions.deepPopulate[i].select += key.substring(deepPopulate[i].length + 1)
              delete queryOptions.select[key]
            }
          }

          // If other specific fields are selected, add the deepPopulated field
          if (queryOptions.select) {
            if (Object.keys(queryOptions.select).length > 0 && !queryOptions.select[deepPopulate[i]]) {
              queryOptions.select[deepPopulate[i]] = 1
            } else if (Object.keys(queryOptions.select).length === 0) {
              delete queryOptions.select
            }
          }
        }
      } else if (!_.isArray(queryOptions.deepPopulate)) {
        queryOptions.deepPopulate = [queryOptions.deepPopulate]
      }
    }

    return queryOptions
  }

  return function (req, res, next) {
    const whitelist = ['distinct', 'limit', 'deepPopulate', 'query', 'select', 'skip', 'sort']

    req._ermQueryOptions = {}

    for (let key in req.query) {
      if (whitelist.indexOf(key) === -1) {
        continue
      }

      if (key === 'query') {
        try {
          req._ermQueryOptions[key] = JSON.parse(req.query[key], jsonQueryParser)
        } catch (e) {
          return errorHandler(req, res, next)(new Error(`invalid_json_${key}`))
        }
      } else if (key === 'deepPopulate' || key === 'select' || key === 'sort') {
        try {
          req._ermQueryOptions[key] = JSON.parse(req.query[key])
        } catch (e) {
          req._ermQueryOptions[key] = req.query[key]
        }
      } else if (key === 'limit' || key === 'skip') {
        req._ermQueryOptions[key] = parseInt(req.query[key], 10)
      } else {
        req._ermQueryOptions[key] = req.query[key]
      }
    }

    req._ermQueryOptions = parseQueryOptions(req._ermQueryOptions)

    next()
  }
}
