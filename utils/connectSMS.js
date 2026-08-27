require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");
const tls = require("tls");
const fetch = require("node-fetch");

const smsIntermediateCa = fs.readFileSync(
  path.join(__dirname, "../certs/connectsms-intermediate.pem")
);

// ConnectSMS may not send the full certificate chain; include the Thawte
// intermediate so Linux servers with older CA bundles can verify the leaf cert.
const smsHttpsAgent = new https.Agent({
  ca: [...tls.rootCertificates, smsIntermediateCa],
});

async function callExternalApi(destination, message) {
  try {
    const url = new URL(process.env.SMS_API_URL);
    url.searchParams.append("from_number", process.env.SMS_API_SENDERID);
    url.searchParams.append("username", process.env.SMS_API_USERNAME);
    url.searchParams.append("password", process.env.SMS_API_PASSWORD);
    url.searchParams.append("destination", destination);
    url.searchParams.append("message", message);

    const response = await fetch(url, { agent: smsHttpsAgent });
    const text = await response.text();
    console.log("SMS API response:", text);
    return text;
  } catch (error) {
    console.error("Error calling SMS API:", error);
    throw error;
  }
}

module.exports = callExternalApi;
