// Import required dependencies
const express = require('express');       // Web framework for Node.js
const multer = require('multer');         // Middleware for handling multipart/form-data (file uploads)
const path = require('path');             // Utility for working with file and directory paths
const fs = require('fs');                 // File system module for file operations
const { PdfReader } = require('pdfreader'); // Library for extracting text from PDF files
const app = express();                    // Create Express application instance
const port = 3001;                        // Port number the server will listen on

console.log("Testing");                   // Debug log to verify server initialization

// Function to ensure all required directories exist
function ensureDirectories() {
    // Define all required directories
    const dirs = [
        'uploads',                // For uploaded PDFs
        'public',                 // For static files
        'public/sites',           // For generated websites
        'public/templates',       // For website templates
        'data'                    // For storing metadata
    ];

    dirs.forEach(dir => {
        const dirPath = path.join(__dirname, dir);
        try {
            // Check if directory exists
            if (!fs.existsSync(dirPath)) {
                console.log(`Creating directory: ${dirPath}`);
                // Create directory recursively
                fs.mkdirSync(dirPath, { recursive: true });
                console.log(`Successfully created directory: ${dirPath}`);
            }
        } catch (error) {
            console.error(`Error creating directory ${dirPath}:`, error);
            process.exit(1); // Exit if we can't create required directories
        }
    });

    // Create default template if it doesn't exist
    const templatePath = path.join(__dirname, 'public', 'templates', 'modern.css');
    if (!fs.existsSync(templatePath)) {
        try {
            const defaultTemplate = `
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    margin: 0;
                    padding: 20px;
                    max-width: 800px;
                    margin: 0 auto;
                }
                header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .resume-content {
                    white-space: pre-wrap;
                }
            `;
            fs.writeFileSync(templatePath, defaultTemplate);
            console.log('Created default template file');
        } catch (error) {
            console.error('Error creating default template:', error);
        }
    }
}

// Call the function to ensure all directories are created
ensureDirectories();

// Configure file storage for uploaded resumes
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function(req, file, cb) {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDFs are allowed'));
    }
    cb(null, true);
  }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));
// Serve the root directory for index.html and styles.css
app.use(express.static(__dirname));

// Route for the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route to handle resume submissions
app.post('/submit-resume', upload.single('resumeFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }
  
  const name = req.body.fullName;
  const style = req.body.style;
  const linkedin = req.body.linkedin;
  const filePath = req.file.path;
  
  const submissionId = Date.now().toString();
  
  const submissionData = {
    id: submissionId,
    name: name,
    style: style,
    linkedin: linkedin,
    filePath: filePath,
    timestamp: new Date().toISOString()
  };
  
  try {
    // Save submission metadata
    fs.writeFileSync(
      path.join(__dirname, 'data', `${submissionId}.json`), 
      JSON.stringify(submissionData, null, 2)
    );
    
    // Extract text from PDF
    const text = await extractTextFromPDF(filePath);
    console.log("Extracted text:", text);
    
    // Save extracted text
    fs.writeFileSync(
      path.join(__dirname, 'data', `${submissionId}-content.txt`),
      text
    );
    
    // Generate website
    generateWebsite(submissionData, text, (websiteUrl) => {
      res.redirect(`/success?id=${submissionId}&url=${encodeURIComponent(websiteUrl)}`);
    });
  } catch (error) {
    console.error("Error processing resume:", error);
    res.status(500).send("Error processing your resume. Please try again.");
  }
});

function extractTextFromPDF(pdfPath, callback) {
  console.log("Starting PDF extraction from:", pdfPath);
  let textContent = '';
  let items = [];
  
  return new Promise((resolve, reject) => {
    new PdfReader().parseFileItems(pdfPath, (err, item) => {
      if (err) {
        console.error("Error parsing PDF:", err);
        reject(err);
        return;
      }
      
      if (!item) {
        // End of file reached
        console.log("PDF parsing completed");
        console.log("Extracted text length:", textContent.length);
        console.log("First 500 characters of extracted text:", textContent.substring(0, 500));
        
        // If no text was extracted, provide a default message
        if (!textContent.trim()) {
          textContent = "Unable to extract text from PDF. Please ensure the PDF contains selectable text.";
        }
        
        resolve(textContent);
        return;
      }
      
      if (item.text) {
        // Store the item for debugging
        items.push(item);
        
        // Add text with proper spacing
        textContent += item.text + ' ';
        
        // Log the extracted text for debugging
        console.log("Extracted text item:", {
          text: item.text,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height
        });
      }
    });
  });
}

// Function to generate a website from the resume data
function generateWebsite(submissionData, resumeText, callback) {
  console.log("Generating website with enhanced layout");
  console.log("Raw resume text:", resumeText); // Debug the input text
  
  const { id, name, style, linkedin } = submissionData;
  
  // Create directory for this specific website
  const siteDir = path.join(__dirname, 'public', 'sites', id);
  if (!fs.existsSync(siteDir)) {
    fs.mkdirSync(siteDir, { recursive: true });
  }

  // Parse the resume text into sections
  const sections = parseResumeText(resumeText);
  console.log("Parsed sections:", JSON.stringify(sections, null, 2)); // Debug parsed sections
  
  // Create HTML content with enhanced layout
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${name}'s Professional Profile</title>
      <link rel="stylesheet" href="/templates/${style || 'modern'}.css">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
      <style>
        :root {
          --primary-color: #2c3e50;
          --secondary-color: #3498db;
          --text-color: #333;
          --light-bg: #f8f9fa;
        }
        
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: var(--text-color);
          margin: 0;
          padding: 0;
        }
        
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }
        
        header {
          background: var(--primary-color);
          color: white;
          padding: 2rem 0;
          text-align: center;
        }
        
        .profile-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }
        
        .contact-info {
          text-align: right;
        }
        
        .section {
          background: white;
          padding: 2rem;
          margin-bottom: 2rem;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .section h2 {
          color: var(--primary-color);
          border-bottom: 2px solid var(--secondary-color);
          padding-bottom: 0.5rem;
          margin-bottom: 1.5rem;
        }
        
        .experience-item, .education-item {
          margin-bottom: 1.5rem;
        }
        
        .skills-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        
        .skill-tag {
          background: var(--light-bg);
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.9rem;
        }
        
        .social-links {
          display: flex;
          gap: 1rem;
          justify-content: center;
          margin-top: 2rem;
        }
        
        .social-links a {
          color: var(--primary-color);
          font-size: 1.5rem;
          transition: color 0.3s;
        }
        
        .social-links a:hover {
          color: var(--secondary-color);
        }
        
        @media (max-width: 768px) {
          .profile-header {
            flex-direction: column;
            text-align: center;
          }
          
          .contact-info {
            text-align: center;
            margin-top: 1rem;
          }
        }
      </style>
    </head>
    <body>
      <header>
        <div class="container">
          <div class="profile-header">
            <h1>${name}</h1>
            <div class="contact-info">
              ${linkedin ? `<a href="${linkedin}" target="_blank" style="color: white; text-decoration: none;">
                <i class="fab fa-linkedin"></i> LinkedIn Profile
              </a>` : ''}
            </div>
          </div>
        </div>
      </header>
      
      <main class="container">
        <!-- Debug section to show raw text -->
        <section class="section">
          <h2>Text from the PDF</h2>
          <pre style="white-space: pre-wrap; background: #f5f5f5; padding: 1rem; border-radius: 4px;">${resumeText}</pre>
        </section>

        ${sections.summary ? `
          <section class="section">
            <h2>Professional Summary</h2>
            <p>${sections.summary}</p>
          </section>
        ` : ''}
        
        ${sections.experience.length > 0 ? `
          <section class="section">
            <h2>Work Experience</h2>
            ${sections.experience.map(exp => `
              <div class="experience-item">
                <h3>${exp.title}</h3>
                <p class="company">${exp.company}</p>
                <p class="duration">${exp.duration}</p>
                <ul>
                  ${exp.responsibilities.map(resp => `<li>${resp}</li>`).join('')}
                </ul>
              </div>
            `).join('')}
          </section>
        ` : ''}
        
        ${sections.education.length > 0 ? `
          <section class="section">
            <h2>Education</h2>
            ${sections.education.map(edu => `
              <div class="education-item">
                <h3>${edu.degree}</h3>
                <p class="institution">${edu.institution}</p>
                <p class="year">${edu.year}</p>
                ${edu.details ? `<p>${edu.details}</p>` : ''}
              </div>
            `).join('')}
          </section>
        ` : ''}
        
        ${sections.skills.length > 0 ? `
          <section class="section">
            <h2>Skills</h2>
            <div class="skills-list">
              ${sections.skills.map(skill => `
                <span class="skill-tag">${skill}</span>
              `).join('')}
            </div>
          </section>
        ` : ''}
        
        ${sections.other ? `
          <section class="section">
            <h2>Additional Information</h2>
            <p>${sections.other}</p>
          </section>
        ` : ''}
      </main>
      
      <footer class="container">
        <div class="social-links">
          ${linkedin ? `<a href="${linkedin}" target="_blank"><i class="fab fa-linkedin"></i></a>` : ''}
        </div>
        <p style="text-align: center; margin-top: 2rem; color: #666;">
          Generated by Sitecraft.AI
        </p>
      </footer>
    </body>
    </html>
  `;
  
  // Write the HTML file to the website directory
  fs.writeFileSync(path.join(siteDir, 'index.html'), htmlContent);
  
  // Generate the URL for the new website
  const websiteUrl = `/sites/${id}/index.html`;
  callback(websiteUrl);
}

// Route for the success page
app.get('/success', (req, res) => {
  const id = req.query.id;                // Get submission ID from query parameters
  const url = req.query.url;              // Get website URL from query parameters
  
  // Generate success page with link to the created website (after creating the website)
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Success!</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="styles.css">
    </head>
    <body>
      <div class="form-container">
        <h1>Success!</h1>
        <p>Your resume website has been created.</p>
        <p><a href="${url}" target="_blank" class="upload-button">View Your Website</a></p>
      </div>
    </body>
    </html>
  `);
});

function parseResumeText(text) {
  console.log("Starting resume text parsing");
  console.log("Input text length:", text.length);
  console.log("First 500 characters of input text:", text.substring(0, 500));
  
  const sections = {
    summary: '',
    experience: [],
    education: [],
    skills: [],
    other: ''
  };

  // Split text into lines and process
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  console.log("Number of lines to process:", lines.length);
  console.log("First 10 lines:", lines.slice(0, 10));

  let currentSection = 'other';
  let currentExperience = null;
  let currentEducation = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Debug each line
    console.log(`Processing line ${i + 1}:`, line);

    // Check for section headers
    if (line.toLowerCase().includes('summary') || line.toLowerCase().includes('objective')) {
      console.log("Found summary section");
      currentSection = 'summary';
      continue;
    } else if (line.toLowerCase().includes('experience') || line.toLowerCase().includes('work history')) {
      console.log("Found experience section");
      currentSection = 'experience';
      continue;
    } else if (line.toLowerCase().includes('education')) {
      console.log("Found education section");
      currentSection = 'education';
      continue;
    } else if (line.toLowerCase().includes('skills') || line.toLowerCase().includes('technical skills')) {
      console.log("Found skills section");
      currentSection = 'skills';
      continue;
    }

    // Process content based on current section
    switch (currentSection) {
      case 'summary':
        sections.summary += line + ' ';
        break;
      
      case 'experience':
        // Look for job title pattern
        if (line.match(/^[A-Za-z\s]+(?:at|@|\bat\b)/i) || 
            line.match(/^[A-Za-z\s]+(?:at|@|\bat\b)/i)) {
          console.log("Found job title:", line);
          if (currentExperience) {
            sections.experience.push(currentExperience);
          }
          const [title, ...companyParts] = line.split(/(?:at|@|\bat\b)/i);
          currentExperience = {
            title: title.trim(),
            company: companyParts.join('').trim(),
            duration: '',
            responsibilities: []
          };
        } else if (currentExperience) {
          if (line.match(/\d{4}/)) {
            console.log("Found duration:", line);
            currentExperience.duration = line;
          } else if (line.startsWith('•') || line.startsWith('-')) {
            console.log("Found responsibility:", line);
            currentExperience.responsibilities.push(line.substring(1).trim());
          }
        }
        break;
      
      case 'education':
        // Look for degree pattern
        if (line.match(/\b(B\.S\.|B\.A\.|M\.S\.|M\.A\.|Ph\.D\.|Bachelor|Master|Doctorate)\b/i)) {
          console.log("Found degree:", line);
          if (currentEducation) {
            sections.education.push(currentEducation);
          }
          const [degree, ...institutionParts] = line.split(/\bat\b/i);
          currentEducation = {
            degree: degree.trim(),
            institution: institutionParts.join('').trim(),
            year: '',
            details: ''
          };
        } else if (currentEducation) {
          if (line.match(/\d{4}/)) {
            console.log("Found year:", line);
            currentEducation.year = line;
          } else {
            currentEducation.details += line + ' ';
          }
        }
        break;
      
      case 'skills':
        // Split skills by common delimiters
        const skills = line.split(/[,;•]/).map(s => s.trim()).filter(s => s);
        console.log("Found skills:", skills);
        sections.skills.push(...skills);
        break;
      
      default:
        sections.other += line + ' ';
    }
  }

  // Add any remaining experience or education entries
  if (currentExperience) {
    sections.experience.push(currentExperience);
  }
  if (currentEducation) {
    sections.education.push(currentEducation);
  }

  // Debug the parsed sections
  console.log("Parsed sections:", {
    summaryLength: sections.summary.length,
    experienceCount: sections.experience.length,
    educationCount: sections.education.length,
    skillsCount: sections.skills.length,
    otherLength: sections.other.length
  });

  return sections;
}

// Start the server and listen for connections
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`); // Log server start
});
