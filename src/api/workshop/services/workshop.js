'use strict';

/**
 * workshop service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::workshop.workshop');
