const http = require('http');
const sax = require('sax');
const sql = require('mssql');

// Define the IP camera server address and port
const SERVER_ADDRESS = "146.88.24.73";
const SERVER_PORT = 3065;

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


// Define the tags to capture
const tagsToCapture = ['mac', 'sn', 'enterCarCount', 'enterPersonCount', 'enterBikeCount'];

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
        let mac, sn, enterCarCount, enterPersonCount, enterBikeCount;

        // Register event handlers for parsing
        parser.on('opentag', node => {
            if (node.name === 'config') {
                insideConfigTag = true;
            } else if (insideConfigTag && tagsToCapture.includes(node.name)) {
                tag = node.name;
                value = '';
            }
        });

        // Inside the parser.on('closetag', ...) event handler
        parser.on('closetag', tagName => {
            if (tagName === 'config') {
                insideConfigTag = false;
                // Insert data into MSSQL database
                insertIntoDatabase(mac, sn, enterCarCount, enterPersonCount, enterBikeCount, sqlConfig);
            } else if (insideConfigTag && tagsToCapture.includes(tagName)) {
                console.log(`${tagName}: ${value}`);
                switch (tagName) {
                    case 'mac':
                        mac = value;
                        break;
                    case 'sn':
                        sn = value;
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
async function insertIntoDatabase(mac, sn, enterCarCount, enterPersonCount, enterBikeCount, config) {
    let pool;
    try {
        // Connect to the database
        pool = await sql.connect(config);

        // Create a new request
        const request = pool.request();

        // Define the query to insert data into the table
        const query = `
        INSERT INTO MplusCam.CameraData (mac, sn, enterCarCount, enterPersonCount, enterBikeCount)
        VALUES (@mac, @sn, @enterCarCount, @enterPersonCount, @enterBikeCount);
        `;

        // Execute the query
        const result = await request
            .input('mac', sql.VarChar, mac)
            .input('sn', sql.VarChar, sn || null) // Provide null if sn is not available
            .input('enterCarCount', sql.Int, enterCarCount || null) // Provide null if enterCarCount is not available
            .input('enterPersonCount', sql.Int, enterPersonCount || null) // Provide null if enterPersonCount is not available
            .input('enterBikeCount', sql.Int, enterBikeCount || null) // Provide null if enterBikeCount is not available
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
