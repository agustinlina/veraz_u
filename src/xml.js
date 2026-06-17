const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  textNodeName: 'value',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true
});

function parseXml(xml) {
  return parser.parse(xml);
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function findSoapBody(parsed) {
  return parsed?.Envelope?.Body || parsed?.Body || null;
}

function findSoapFault(parsed) {
  const body = findSoapBody(parsed);
  return body?.Fault || body?.fault || null;
}

module.exports = { parseXml, escapeXml, findSoapBody, findSoapFault };
