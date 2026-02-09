import * as uuid from 'uuid';
import dotenv from 'dotenv';
dotenv.config();

function formatPropertyHeader(string = '') {
  return string
    .replace(/([A-Z])/g, (match, group) => `-${group.toLowerCase()}`)
    .replace(/^-/, '');
}
function formatHeaders(headers) {
  return Object.keys(headers).reduce(
    (acu, act) => ({ [formatPropertyHeader(act)]: headers[act], ...acu }),
    {},
  );
}
function responseFunction({ status, headers, body }) {
  const response = {
    statusCode: status,
    body: typeof body === 'object' ? JSON.stringify(body) : body,
    ...(headers ? { headers: formatHeaders(headers) } : {}),
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
  };
  //console.log("RESPONSE ->", response)
  return response;
}
const execute = async ({ event, context, functionController }) => {
  const startTime = process.hrtime();
  const tx = uuid.v4();

  const {
    headers = {},
    httpMethod,
    queryStringParameters = {},
    pathParameters = {},
    body = null,
    path,
    requestContext = {},
    Records,
  } = event;
  const mainTx = headers['x-main-tx'] || tx;
  const sqsBodyParams = Records ? JSON.parse(Records[0].body) : {};

  const { authorizer } = requestContext;
  console.log(JSON.stringify({ event, tx, context, sqsBodyParams }, null, 2));

  try {
    const {
      response,
      status = 200,
      headers: functionHeaders = null,
    } = await functionController({
      headers,
      params: ['POST', 'PUT', 'PATCH'].includes(httpMethod)
        ? JSON.parse(body)
        : body,
      queryStringParameters,
      method: httpMethod,
      path,
      pathParameters,
      authorizer,
      sqsBodyParams,
      tx,
      mainTx,
    });

    console.log({
      startTime,
      tx,
      response,
      headers,
      context,
      functionHeaders,
      status,
    });

    return responseFunction({
      status,
      headers: functionHeaders,
      body: response,
    });
  } catch (error) {
    const {
      message = 'Internal Server Error',
      code = 500,
      status = 500,
    } = error;
    //console.log({ message, code, status })
    return responseFunction({
      status,
      body: JSON.stringify({ message, code }),
    });
  }
};

export default execute;
