process.env.NODE_ENV = 'test';

import IORedis from 'ioredis';
import { Worker } from 'bullmq';

// Override IORedis connection to be a no-op
IORedis.prototype.connect = function() {
  console.log("Mocked IORedis.prototype.connect called!");
  return Promise.resolve();
};

// Also stub out Worker prototype connect/start methods if needed
Worker.prototype.run = function() {
  console.log("Mocked Worker.prototype.run called!");
  return Promise.resolve();
};

import { server } from '../server.js';
console.log("Successfully imported server.js!");
process.exit(0);
