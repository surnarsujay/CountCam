const http = require('http');
const sax = require('sax');
const sql = require('mssql');

// Define the IP camera server address and port
const SERVER_ADDRESS = "192.168.0.116";
const SERVER_PORT = 3060;

// Define the database configuration
const sqlConfig = {
    user: 'MplusCam',
    password: 'pv973$8eO',
    server: '146.88.24.73',
    database: 'lissomMplusCam',
    options: {
        encrypt: true,
        trustServerCertificate: true, // Temporary setting for diagnosis
        cryptoCredentialsDetails: {
            minVersion: 'TLSv1.2',
        }
    },
};

// Function to format the current system datetime for SQL Server
function formatSystemDateTimeForSqlServer() {
    const currentDate = new Date();
    const formattedDateTime = currentDate.toISOString().replace('T', ' ').replace('Z', '');
    return formattedDateTime;
}

// Define the tags to capture
const tagsToCapture = ['mac', 'sn', 'deviceName', 'enterCarCount', 'enterPersonCount', 'enterBikeCount',
    'leaveCarCount', 'leavePersonCount', 'leaveBikeCount', 'existCarCount', 'existPersonCount', 'existBikeCount'];

// Create HTTP server
const server = http.createServer((req, res) => {
    // Handle POST requests
    if (req.method === 'POST') {
        let parser = sax.createStream(true, { trim: true });

        // Flag to indicate if we're inside the <config> tag
        let insideConfigTag = false;
        let tag = ''; // Current tag name
        let value = ''; // Current tag value

        // Variables to store extracted values
        let mac, sn, deviceName, enterCarCount, enterPersonCount, enterBikeCount;
        let leaveCarCount, leavePersonCount, leaveBikeCount, existCarCount, existPersonCount, existBikeCount;

        // Register event handlers for parsing
        parser.on('opentag', node => {
            if (node.name === 'config') {
                insideConfigTag = true;
            } else if (insideConfigTag && tagsToCapture.includes(node.name)) {
                tag = node.name;
                value = '';
            }
        });

        parser.on('closetag', tagName => {
            if (tagName === 'config') {
                insideConfigTag = false;
                // Insert data into MSSQL database
                insertIntoDatabase(mac, sn, deviceName, enterCarCount, enterPersonCount, enterBikeCount,
                    leaveCarCount, leavePersonCount, leaveBikeCount, existCarCount, existPersonCount, existBikeCount, sqlConfig);
            } else if (insideConfigTag && tagsToCapture.includes(tagName)) {
                console.log(`${tagName}: ${value}`);
                switch (tagName) {
                    case 'mac':
                        mac = value;
                        break;
                    case 'sn':
                        sn = value;
                        break;
                    case 'deviceName':
                        deviceName = value;
                        break;
                    case 'enterCarCount':
                        enterCarCount = parseInt(value);
                        break;
                    case 'enterPersonCount':
                        enterPersonCount = parseInt(value);
                        break;
                    case 'enterBikeCount':
                        enterBikeCount = parseInt(value);
                        break;
                    case 'leaveCarCount':
                        leaveCarCount = parseInt(value);
                        break;
                    case 'leavePersonCount':
                        leavePersonCount = parseInt(value);
                        break;
                    case 'leaveBikeCount':
                        leaveBikeCount = parseInt(value);
                        break;
                    case 'existCarCount':
                        existCarCount = parseInt(value);
                        break;
                    case 'existPersonCount':
                        existPersonCount = parseInt(value);
                        break;
                    case 'existBikeCount':
                        existBikeCount = parseInt(value);
                        break;
                }
            }
        });

        parser.on('text', text => {
            value += text; // Concatenate text data
        });

        parser.on('cdata', cdata => {
            value += cdata; // Concatenate CDATA
        });

        req.pipe(parser);

        parser.on('error', err => {
            console.error('XML Parsing Error:', err);
        });

        req.on('end', () => {
            // Log the current system datetime in SQL Server format
            console.log("System DateTime (SQL Server format):", formatSystemDateTimeForSqlServer());
            console.log("Finished processing data");
        });
    } else {
        // Handle non-POST requests
        res.writeHead(405, {'Content-Type': 'text/plain'});
        res.end('Method Not Allowed\n');
    }
});

// Function to insert data into MSSQL database
async function insertIntoDatabase(mac, sn, deviceName, enterCarCount, enterPersonCount, enterBikeCount,
    leaveCarCount, leavePersonCount, leaveBikeCount, existCarCount, existPersonCount, existBikeCount, config) {
    let pool;
    try {
        // Connect to the database
        pool = await sql.connect(config);

        // Create a new request
        const request = pool.request();

        // Define the query to insert data into the table
        const query = `
        INSERT INTO MplusCam.CameraData (mac, currentTime, sn, deviceName, enterCarCount, enterPersonCount, enterBikeCount,
            leaveCarCount, leavePersonCount, leaveBikeCount, existCarCount, existPersonCount, existBikeCount)
        VALUES (@mac, @currentTime, @sn, @deviceName, @enterCarCount, @enterPersonCount, @enterBikeCount,
            @leaveCarCount, @leavePersonCount, @leaveBikeCount, @existCarCount, @existPersonCount, @existBikeCount);
        `;

        // Execute the query
        const result = await request
            .input('mac', sql.VarChar, mac)
            .input('currentTime', sql.DateTime, formatSystemDateTimeForSqlServer())
            .input('sn', sql.VarChar, sn || null) // Provide null if sn is not available
            .input('deviceName', sql.VarChar, deviceName || null) // Provide null if deviceName is not available
            .input('enterCarCount', sql.Int, enterCarCount || null) // Provide null if enterCarCount is not available
            .input('enterPersonCount', sql.Int, enterPersonCount || null) // Provide null if enterPersonCount is not available
            .input('enterBikeCount', sql.Int, enterBikeCount || null) // Provide null if enterBikeCount is not available
            .input('leaveCarCount', sql.Int, leaveCarCount || null) // Provide null if leaveCarCount is not available
            .input('leavePersonCount', sql.Int, leavePersonCount || null) // Provide null if leavePersonCount is not available
            .input('leaveBikeCount', sql.Int, leaveBikeCount || null) // Provide null if leaveBikeCount is not available
            .input('existCarCount', sql.Int, existCarCount || null) // Provide null if existCarCount is not available
            .input('existPersonCount', sql.Int, existPersonCount || null) // Provide null if existPersonCount is not available
            .input('existBikeCount', sql.Int, existBikeCount || null) // Provide null if existBikeCount is not available
            .query(query);

        console.log('Data inserted successfully');
    } catch (err) {
        console.error('Error inserting data:', err);
    } finally {
        // Close the connection
        if (pool) await pool.close();
    }
}

// Start the server
server.listen(SERVER_PORT, () => {
    console.log(`Server running at http://${SERVER_ADDRESS}:${SERVER_PORT}/`);
});
