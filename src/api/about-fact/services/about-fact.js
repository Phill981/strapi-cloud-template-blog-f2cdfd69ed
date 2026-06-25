'use strict';

/**
 * about-fact service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::about-fact.about-fact');
