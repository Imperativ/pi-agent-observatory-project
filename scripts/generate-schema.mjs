import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {FIELD_LABELS, SCHEMA_VERSION, STATES, CHECK_STATES} from '../src/contract.mjs';
const nullableText = {type: ['string', 'null'], maxLength: 2000};
const verification = {enum: ['verified', 'self_reported', 'unverified', 'unavailable']};
const timestamp = {type: ['string', 'null'], description: 'ISO 8601 with explicit timezone; calendar/future-skew validated by runtime.'};
const provenance = {source: nullableText, observedAt: timestamp, verification};
const metric = value => ({type: ['object', 'null'], properties: {value, ...provenance}, additionalProperties: true});
const stringList = {type: ['array', 'null'], maxItems: 100, items: {type: 'string', maxLength: 2000}};
const listFields = new Set(['tools', 'skills', 'readAreas', 'writeAreas', 'restrictions', 'missingCredentials', 'runtimes']);
const numericFields = new Set(['uptimeSeconds', 'contextWindow', 'contextUsed', 'inputTokens', 'outputTokens', 'cost']);
const progress = {type: ['object', 'null'], properties: {completed: {type: 'number', minimum: 0}, total: {type: 'number', exclusiveMinimum: 0}, basis: {type: 'string', minLength: 1, maxLength: 2000}}, required: ['completed', 'total', 'basis'], additionalProperties: true};
const limitWindow = {type: ['object', 'null'], properties: {used: {type: ['number', 'null'], minimum: 0}, total: {type: ['number', 'null'], exclusiveMinimum: 0}, remainingPercent: {type: ['number', 'null'], minimum: 0, maximum: 100}, resetsAt: {type: ['string', 'null'], maxLength: 2000}, resetText: {type: ['string', 'null'], maxLength: 2000}}, additionalProperties: true};
const rateLimitsType = {anyOf: [{type: 'null'}, nullableText, {type: 'object', properties: {fiveHour: limitWindow, weekly: limitWindow, detail: nullableText}, additionalProperties: true}]};
const collection = item => ({type: ['array', 'null'], maxItems: 100, items: item});
const text = {type: 'string', minLength: 1, maxLength: 2000};
export function generateSchema() {
  const properties = {
    schemaVersion: {const: SCHEMA_VERSION},
    dataset: {enum: ['sample', 'live']},
    observedAt: timestamp,
    live: {type: ['object', 'null'], required: ['source', 'ended'], additionalProperties: true,
      properties: {source: {const: 'pi_extension'}, ended: {type: 'boolean'}}},
  };
  for (const [section, fields] of Object.entries(FIELD_LABELS)) {
    properties[section] = {type: ['object', 'null'], additionalProperties: true, properties: {}};
    for (const field of Object.keys(fields)) {
      const value = listFields.has(field) ? stringList : numericFields.has(field) ? {type: ['number', 'null'], minimum: 0} : field === 'state' ? {enum: [...STATES, null]} : field === 'progress' ? progress : field === 'rateLimits' ? rateLimitsType : nullableText;
      properties[section].properties[field] = metric(value);
    }
  }
  properties.activity = collection({type: 'object', required: ['time', 'category', 'summary', 'status'], additionalProperties: true, properties: {id: nullableText, time: text, category: text, summary: text, status: {enum: ['info', 'running', 'passed', 'failed', 'warning', 'unknown']}, durationMs: {type: ['number', 'null'], minimum: 0}, source: nullableText, verification}});
  properties.artifacts = collection({type: 'object', required: ['path'], additionalProperties: true, properties: {path: text, change: {enum: ['created', 'modified', 'unchanged', 'unknown']}, ...provenance}});
  properties.checks = collection({type: 'object', required: ['name', 'status'], additionalProperties: true, properties: {name: text, status: {enum: CHECK_STATES}, evidence: {type: ['object', 'null'], additionalProperties: true, properties: {command: text, exitCode: {type: 'integer'}, finishedAt: text, source: text}, required: ['command', 'exitCode', 'finishedAt', 'source']}}});
  properties.issues = collection({type: 'object', required: ['summary'], additionalProperties: true, properties: {severity: {enum: ['info', 'warning', 'blocker', 'error']}, summary: text, nextAction: nullableText, ...provenance}});
  return {$schema: 'http://json-schema.org/draft-07/schema#', title: 'Agent Observatory status v1', description: 'Writer contract. The runtime additionally validates dates, completed <= total, provenance and check evidence, and degrades malformed optional values conservatively. Unknown properties are ignored by the renderer.', type: 'object', required: ['schemaVersion'], properties, additionalProperties: true};
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await writeFile(new URL('../agent-status.schema.json', import.meta.url), JSON.stringify(generateSchema(), null, 2) + '\n');
  console.log('agent-status.schema.json aktualisiert.');
}
