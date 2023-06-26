const fs = require('fs');
const path = require('path');
const requestp = require('request-promise');
const platformClient = require('purecloud-platform-client-v2');
const { createLogger, transports, format } = require('winston');
const { Script } = require('vm');

// Create the log directory
const logDir = 'JS_LOGS';
fs.mkdirSync(logDir, { recursive: true });

// Create a logger with Winston
const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
    ),
    transports: [
        new transports.File({ filename: path.join(logDir, 'Script.log') })
    ]
});

// Log an error if the log directory or log file creation fails
logger.on('error', (error) => {
    console.error('Error occurred while creating the log file:', error);
});

const client = platformClient.ApiClient.instance;

// Configure the PureCloud environment and access token
client.setEnvironment(platformClient.PureCloudRegionHosts.us_west_2);
client.setAccessToken(client.authData.accessToken);

const exportContactList = function exportContactList(contactListId, outputPath) {
    logger.info('Exporting contact list...');

    const outboundApi = new platformClient.OutboundApi();
    outboundApi.getOutboundContactlistExport(contactListId, { download: 'false' })
        .then((res) => {
            const downloadUri = res.uri;
            logger.info(JSON.stringify({ uri: downloadUri, headers: { 'Authorization': `bearer ${client.authData.accessToken}` } }));

            // Add a timer before making the requestp call
            setTimeout(() => {
                return requestp({
                    uri: downloadUri,
                    headers: {
                        'Authorization': `bearer ${client.authData.accessToken}`
                    }
                });
            }, 100000);
        })
        .then((res) => {
            logger.info('Export contents retrieved');

            fs.writeFile(outputPath, res, (err) => {
                if (err) {
                    logger.error('Failed to write export contents:', err);
                } else {
                    logger.info('Contents exported successfully');
                    logger.info('Process Completed Successfully.\n');
                    logger.info('------------------------------------------------------------------------------------------------------------');
                }
            });
        })
        .catch((err) => {
            logger.error('Failed to export contact list:', err);
            if (err.body && err.body.code === 'no.available.list_export_uri') {
                logger.info('Waiting for export...');
                setTimeout(() => exportContactList(contactListId, outputPath), 5000);
            }
        });
};

// Read command-line arguments or use default values
const clientId = process.argv[2] || '';
const clientSecret = process.argv[3] || '';
const contactListId = process.argv[4] || '';
const outputPath = process.argv[5] || '';

// Configure the logger to also print to the console
logger.add(new transports.Console());

// Login with client credentials and initiate contact list export
logger.info('Logging Started...');
logger.info(contactListId);

client.loginClientCredentialsGrant(clientId, clientSecret)
    .then(() => {
        logger.info('Logged in successfully with Client ID and Client Secret.');
        const outboundApi = new platformClient.OutboundApi();
        return outboundApi.postOutboundContactlistExport(contactListId);
    })
    .then(() => {
        logger.info('Contact list export initiated');
        exportContactList(contactListId, outputPath);
    })
    .catch((err) => {
        logger.error('Failed to log in or initiate contact list export:', err);
    });
