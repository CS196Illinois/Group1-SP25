// Import required dependencies
const express = require('express');       // Web framework for Node.js
const multer = require('multer');         // Middleware for handling multipart/form-data (file uploads)
const path = require('path');             // Utility for working with file and directory paths
const fs = require('fs');                 // File system module for file operations
const { PdfReader } = require('pdfreader'); // Library for extracting text from PDF files
const app = express();                    // Create Express application instance
const port = 3001;                        // Port number the server will listen on

console.log("Testing");                   // Debug log to verify server initialization

// Configure file storage for uploaded resumes
const storage = multer.diskStorage({
  // Set the destination directory for uploaded files
  destination: function(req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  // Define custom filename for uploaded files to prevent naming conflicts
  filename: function(req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname); // Prepend timestamp to ensure uniqueness
  }
});

// Configure multer with storage options and file filtering
const upload = multer({ 
  storage: storage,
  // Only allow PDF files to be uploaded
  fileFilter: function(req, file, cb) {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDFs are allowed'));
    }
    cb(null, true);
  }
});

// Serve static files from the public directory
app.use(express.static('public'));

// Route for the homepage
app.get('/', (req, res) => {
  console.log("get");                     // Debug log to track homepage requests
  res.sendFile(path.join(__dirname, 'index.html')); // Serve the main HTML page
});

// Route to handle resume submissions
app.post('/submit-resume', upload.single('resumeFile'), (req, res) => {
  // Check if a file was uploaded
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }
  
  // Extract form data
  const name = req.body.name;             // User's name from the form
  const style = req.body.style;           // Selected website style from the form
  const filePath = req.file.path;         // Path to the uploaded PDF file
  
  // Generate unique ID for this submission using timestamp
  const submissionId = Date.now().toString();
  
  // Create metadata object for the submission
  const submissionData = {
    id: submissionId,
    name: name,
    style: style,
    filePath: filePath,
    timestamp: new Date().toISOString()   // ISO format timestamp for record-keeping
  };
  
  // Create data directory if it doesn't exist
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }
  
  // Save submission metadata as JSON
  fs.writeFileSync(
    path.join(dataDir, `${submissionId}.json`), 
    JSON.stringify(submissionData, null, 2)  // Pretty-print JSON with 2-space indentation
  );
  
  // Extract text from the uploaded PDF
  extractTextFromPDF(filePath, (text) => {
    console.log("Testing");               // Debug log during PDF extraction
    
    // Save extracted text to a file
    fs.writeFileSync(
      path.join(dataDir, `${submissionId}-content.txt`),
      text
    );
    
    // Generate the website using extracted text
    generateWebsite(submissionData, text, (websiteUrl) => {
      // Redirect to success page with the submission ID and website URL
      res.redirect(`/success?id=${submissionId}&url=${encodeURIComponent(websiteUrl)}`);
    });
  });
});

// Function to extract text content from a PDF file
function extractTextFromPDF(pdfPath, callback) {
  console.log("Testing Extraction");      // Debug log for PDF extraction process
  let textContent = '';                   // Initialize empty string to store extracted text
  
  // Use PdfReader to parse the PDF file
  new PdfReader().parseFileItems(pdfPath, (err, item) => {
    if (err) console.error(err);          // Log any errors during PDF parsing
    else if (!item) callback(textContent); // End of file reached, return collected text
    else if (item.text) textContent += item.text + ' '; // Append text content with spaces
  });
}

// Function to generate a website from the resume data
function generateWebsite(submissionData, resumeText, callback) {
  console.log("Testing");                 // Debug log for website generation
  const { id, name, style } = submissionData; // Extract relevant data
  
  // Create directory for all websites if it doesn't exist
  const sitesDir = path.join(__dirname, 'public', 'sites');
  if (!fs.existsSync(sitesDir)) {
    fs.mkdirSync(sitesDir);
  }
  
  // Create directory for this specific website
  const siteDir = path.join(sitesDir, id);
  if (!fs.existsSync(siteDir)) {
    fs.mkdirSync(siteDir);
  }
  
  // Create HTML content using a simple template
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${name}'s Resume Website</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/templates/${style}.css"> <!-- Apply the selected style -->
    </head>
    <body>
      <header>
        <h1>${name}</h1>
        <p>Professional Profile</p>
      </header>
      
      <main>
        <section class="resume-content">
          <pre>${resumeText}</pre> <!-- Display extracted resume text -->
        </section>
      </main>
      
      <footer>
        <p>Generated by Resume Website Generator</p>
      </footer>
    </body>
    </html>
  `;
  
  // Write the HTML file to the website directory
  fs.writeFileSync(path.join(siteDir, 'index.html'), htmlContent);
  
  // Generate the URL for the new website
  const websiteUrl = `/sites/${id}/index.html`;
  callback(websiteUrl); // Return the URL through the callback
}

// Route for the success page
app.get('/success', (req, res) => {
  const id = req.query.id;                // Get submission ID from query parameters
  const url = req.query.url;              // Get website URL from query parameters
  
  // Generate success page with link to the created website
  res.send(`
    <h1>Success!</h1>
    <p>Your resume website has been created.</p>
    <p><a href="${url}" target="_blank">View Your Website</a></p>
  `);
});

// Start the server and listen for connections
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`); // Log server start
});
