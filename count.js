require('dotenv').config();
const http = require('http');
const sax = require('sax');
const sql = require('mssql');

// Define the IP camera server address and port
const SERVER_ADDRESS = process.env.SERVER_ADDRESS;
const SERVER_PORT = process.env.COUNT_SERVER_PORT;

// Define the database configuration
const sqlConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
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

// Function to insert data into MSSQL database with duplicate check and update logic for CountCameraData table
async function insertIntoDatabase(mac, sn, deviceName, enterCarCount, enterPersonCount, enterBikeCount,
    leaveCarCount, leavePersonCount, leaveBikeCount, existCarCount, existPersonCount, existBikeCount, config) {
    let pool;
    try {
        // Connect to the database
        pool = await sql.connect(config);

        // Check if an entry with the same 'sn' already exists in CameraData
        const request = pool.request();
        const checkQuery = `
        SELECT TOP 1 sn FROM dbo.CameraData WHERE sn = @sn ORDER BY currentTime DESC;
        `;

        const result = await request
            .input('sn', sql.VarChar, sn)
            .query(checkQuery);

        if (result.recordset.length > 0) {
            // Duplicate entry found, skip insertion
            console.log(`Entry with sn: ${sn} already exists in CameraData. Skipping insertion.`);
        } else {
            // Insert into CameraData
            const insertQuery = `
            INSERT INTO dbo.CameraData (mac, currentTime, sn, deviceName, enterCarCount, enterPersonCount, enterBikeCount,
                leaveCarCount, leavePersonCount, leaveBikeCount, existCarCount, existPersonCount, existBikeCount)
            VALUES (@mac, @currentTime, @sn, @deviceName, @enterCarCount, @enterPersonCount, @enterBikeCount,
                @leaveCarCount, @leavePersonCount, @leaveBikeCount, @existCarCount, @existPersonCount, @existBikeCount);
            `;

            await request
                .input('mac', sql.VarChar, mac)
                .input('currentTime', sql.DateTime, formatSystemDateTimeForSqlServer())
                .input('sn', sql.VarChar, sn || null)
                .input('deviceName', sql.VarChar, deviceName || null)
                .input('enterCarCount', sql.Int, enterCarCount || null)
                .input('enterPersonCount', sql.Int, enterPersonCount || null)
                .input('enterBikeCount', sql.Int, enterBikeCount || null)
                .input('leaveCarCount', sql.Int, leaveCarCount || null)
                .input('leavePersonCount', sql.Int, leavePersonCount || null)
                .input('leaveBikeCount', sql.Int, leaveBikeCount || null)
                .input('existCarCount', sql.Int, existCarCount || null)
                .input('existPersonCount', sql.Int, existPersonCount || null)
                .input('existBikeCount', sql.Int, existBikeCount || null)
                .query(insertQuery);

            console.log('Data inserted successfully into CameraData.');
        }

        // Insert or update into CountCameraData
        const updateOrInsertQuery = `
        MERGE dbo.CountCameraData AS target
        USING (SELECT @sn AS sn) AS source
        ON (target.sn = source.sn)
        WHEN MATCHED THEN
            UPDATE SET mac = @mac, deviceName = @deviceName, enterCarCount = @enterCarCount,
            enterPersonCount = @enterPersonCount, enterBikeCount = @enterBikeCount,
            leaveCarCount = @leaveCarCount, leavePersonCount = @leavePersonCount,
            leaveBikeCount = @leaveBikeCount, existCarCount = @existCarCount,
            existPersonCount = @existPersonCount, existBikeCount = @existBikeCount
        WHEN NOT MATCHED THEN
            INSERT (sn, mac, deviceName, enterCarCount, enterPersonCount, enterBikeCount, leaveCarCount,
                leavePersonCount, leaveBikeCount, existCarCount, existPersonCount, existBikeCount)
            VALUES (@sn, @mac, @deviceName, @enterCarCount, @enterPersonCount, @enterBikeCount,
                @leaveCarCount, @leavePersonCount, @leaveBikeCount, @existCarCount, @existPersonCount, @existBikeCount);
        `;

        await request
            .input('mac', sql.VarChar, mac)
            .input('sn', sql.VarChar, sn)
            .input('deviceName', sql.VarChar, deviceName || null)
            .input('enterCarCount', sql.Int, enterCarCount || null)
            .input('enterPersonCount', sql.Int, enterPersonCount || null)
            .input('enterBikeCount', sql.Int, enterBikeCount || null)
            .input('leaveCarCount', sql.Int, leaveCarCount || null)
            .input('leavePersonCount', sql.Int, leavePersonCount || null)
            .input('leaveBikeCount', sql.Int, leaveBikeCount || null)
            .input('existCarCount', sql.Int, existCarCount || null)
            .input('existPersonCount', sql.Int, existPersonCount || null)
            .input('existBikeCount', sql.Int, existBikeCount || null)
            .query(updateOrInsertQuery);

        console.log('Data inserted/updated successfully into CountCameraData.');

    } catch (err) {
        console.error('Database error:', err);
    } finally {
        if (pool) {
            pool.close();
        }
    }
}

// Start the server
server.listen(SERVER_PORT, SERVER_ADDRESS, () => {
    console.log(`Server is running on http://${SERVER_ADDRESS}:${SERVER_PORT}`);
});
