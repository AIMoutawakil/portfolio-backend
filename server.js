const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

if (!process.env.VERCEL) {
  require('dotenv').config();
}
// ==========================================
// 1. INITIALISATION DE L'APPLICATION
// ==========================================
const app = express();

app.use(cors({
  origin: [
    'https://portfolio-frontend-pmehnx7wz.vercel.app', 
    'https://moutawakilimrane.com', 
    'https://www.moutawakilimrane.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 2. GESTION DU DOSSIER UPLOADS (Compatible Vercel)
// ==========================================
const uploadsDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, 'uploads');

try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (error) {
  console.warn("Info Vercel : Mode serverless, dossier temporaire utilisé.", error.message);
}

const PORT = process.env.PORT || 5000;

const PUBLIC_API_URL = (
  process.env.PUBLIC_API_URL || `http://localhost:${PORT}`
).replace(/\/+$/, '');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'portfolio_gmp', // Un dossier sera créé automatiquement sur ton Cloudinary
    resource_type: 'auto',   // Permet d'accepter les images (png/jpg) ET les documents (pdf pour le CV)
  },
});

const upload = multer({ storage: storage });

function getPublicFileUrl(filename) {
  return `${PUBLIC_API_URL}/uploads/${encodeURIComponent(filename)}`;
}

function normalizeStoredFileUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return fileUrl;

  if (fileUrl.startsWith('/uploads/')) {
    return `${PUBLIC_API_URL}${fileUrl}`;
  }

  try {
    const parsedUrl = new URL(fileUrl);
    const isLocalhost = ['localhost', '127.0.0.1'].includes(parsedUrl.hostname);

    if (isLocalhost && parsedUrl.pathname.startsWith('/uploads/')) {
      return `${PUBLIC_API_URL}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    }
  } catch (err) {
    // Ignorer si l'URL n'est pas valide
  }

  return fileUrl;
}

function getUploadFilename(fileUrl) {
  try {
    return path.basename(new URL(fileUrl, PUBLIC_API_URL).pathname);
  } catch (err) {
    return '';
  }
}

// ==========================================
// 3. CONNEXION À LA BASE DE DONNÉES
// ==========================================
console.log("🛠️ Démarrage de la connexion MySQL...");

const db = mysql.createPool({
  host: process.env.DB_HOST || 'b7xikwk2t8hifkb30bnl-mysql.services.clever-cloud.com',
  user: process.env.DB_USER || 'udwpvwnw25z0fbm5',
  password: process.env.DB_PASSWORD || 'XyspPdYXYoY76aY1yOY4',
  database: process.env.DB_NAME || 'b7xikwk2t8hifkb30bnl',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 2,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ssl: {
    rejectUnauthorized: false
  }
});

// ==========================================
// 4. AUTHENTIFICATION ADMIN & ROUTES API
// ==========================================
app.get('/', (req, res) => {
  res.send('Le serveur API de Moutawakil Imrane est en ligne !');
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || 'imrane';
  const adminPass = process.env.ADMIN_PASS;

  if (username === adminUser && (!adminPass || password === adminPass)) {
    res.json({ success: true, message: 'Authentification réussie' });
  } else {
    res.status(401).json({ success: false, message: 'Identifiants incorrects' });
  }
});

app.get('/api/settings', (req, res) => {
  db.query('SELECT * FROM page_settings WHERE id = 1', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const settings = results[0] || {};
    settings.cv_url = normalizeStoredFileUrl(settings.cv_url);

    if (typeof settings.social_links === 'string') {
      try { settings.social_links = JSON.parse(settings.social_links); } 
      catch (e) { settings.social_links = []; }
    } else if (!settings.social_links) {
      settings.social_links = [];
    }
    
    res.json(settings);
  });
});

app.put('/api/settings', (req, res) => {
  const { hero_greeting, hero_name, hero_title, hero_description, contact_email, contact_location, cv_url, social_links } = req.body;
  const linksJson = JSON.stringify(social_links || []);
  const publicCvUrl = normalizeStoredFileUrl(cv_url);

  const sql = `UPDATE page_settings SET hero_greeting = ?, hero_name = ?, hero_title = ?, hero_description = ?, contact_email = ?, contact_location = ?, cv_url = ?, social_links = ? WHERE id = 1`;

  db.query(sql, [hero_greeting, hero_name, hero_title, hero_description, contact_email, contact_location, publicCvUrl, linksJson], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Paramètres mis à jour avec succès' });
  });
});

app.get('/api/about', (req, res) => {
  db.query('SELECT * FROM about_settings WHERE id = 1', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results[0] || {});
  });
});

app.put('/api/about', (req, res) => {
  const { about_text_1, about_text_2, tools_list, skill_1_title, skill_1_desc, skill_2_title, skill_2_desc, skill_3_title, skill_3_desc } = req.body;
  const sql = `UPDATE about_settings SET about_text_1 = ?, about_text_2 = ?, tools_list = ?, skill_1_title = ?, skill_1_desc = ?, skill_2_title = ?, skill_2_desc = ?, skill_3_title = ?, skill_3_desc = ? WHERE id = 1`;
  
  db.query(sql, [about_text_1, about_text_2, tools_list, skill_1_title, skill_1_desc, skill_2_title, skill_2_desc, skill_3_title, skill_3_desc], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Profil technique mis à jour avec succès' });
  });
});

app.post('/api/upload-project-file', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });
  // req.file.path contient maintenant l'URL web sécurisée générée par Cloudinary
  res.json({ url: req.file.path }); 
});

app.post('/api/upload-cv', upload.single('cv_file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });
  res.json({ cv_url: req.file.path });
});

app.get('/api/skills', (req, res) => {
  const sqlCategories = 'SELECT * FROM skill_categories ORDER BY display_order ASC';
  const sqlSkills = 'SELECT * FROM skills ORDER BY display_order ASC';

  db.query(sqlCategories, (err, categories) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.query(sqlSkills, (err, skills) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const fullCategories = categories.map(cat => ({
        ...cat,
        skills: skills.filter(skill => skill.category_id === cat.id)
      }));
      
      res.json(fullCategories);
    });
  });
});

app.put('/api/skills/bulk', async (req, res) => {
  const { categories } = req.body;
  
  try {
    await new Promise((resolve, reject) => {
      db.query('DELETE FROM skill_categories', (err) => err ? reject(err) : resolve());
    });

    if (categories && categories.length > 0) {
      for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        const insertCat = await new Promise((resolve, reject) => {
          db.query('INSERT INTO skill_categories (title, display_order) VALUES (?, ?)', [cat.title, i], (err, result) => err ? reject(err) : resolve(result));
        });
        
        const newCatId = insertCat.insertId;

        if (cat.skills && cat.skills.length > 0) {
          for (let j = 0; j < cat.skills.length; j++) {
            const skill = cat.skills[j];
            await new Promise((resolve, reject) => {
              db.query('INSERT INTO skills (category_id, name, percentage, display_order) VALUES (?, ?, ?, ?)', 
              [newCatId, skill.name, skill.percentage, j], (err) => err ? reject(err) : resolve());
            });
          }
        }
      }
    }
    res.json({ message: 'Matrice de compétences sauvegardée et publiée avec succès !' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/skills/categories', (req, res) => {
  const { title } = req.body;
  db.query('INSERT INTO skill_categories (title) VALUES (?)', [title], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Catégorie ajoutée', id: result.insertId });
  });
});

app.delete('/api/skills/categories/:id', (req, res) => {
  db.query('DELETE FROM skill_categories WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Catégorie supprimée' });
  });
});

app.post('/api/skills/items', (req, res) => {
  const { category_id, name, percentage } = req.body;
  db.query('INSERT INTO skills (category_id, name, percentage) VALUES (?, ?, ?)', [category_id, name, percentage], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Compétence ajoutée', id: result.insertId });
  });
});

app.delete('/api/skills/items/:id', (req, res) => {
  db.query('DELETE FROM skills WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Compétence supprimée' });
  });
});

app.get('/api/projects', (req, res) => {
  const sqlProjects = 'SELECT * FROM projects';
  const sqlImages = 'SELECT * FROM project_images ORDER BY display_order ASC';
  const sqlResources = 'SELECT * FROM project_resources';

  db.query(sqlProjects, (err, projects) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.query(sqlImages, (err, images) => {
      if (err) return res.status(500).json({ error: err.message });
      
      db.query(sqlResources, (err, resources) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const fullProjects = projects.map(project => ({
          ...project,
          technologies: project.technologies ? JSON.parse(project.technologies) : [],
          images: images
            .filter(img => img.project_id === project.id)
            .map(img => normalizeStoredFileUrl(img.image_url)),
          resources: resources
            .filter(resource => resource.project_id === project.id)
            .map(resource => ({
              ...resource,
              file_url: normalizeStoredFileUrl(resource.file_url)
            }))
        }));
        res.json(fullProjects);
      });
    });
  });
});

app.put('/api/projects/bulk', async (req, res) => {
  const { projects } = req.body;
  
  try {
    const oldImages = await new Promise((resolve) => db.query('SELECT image_url FROM project_images', (err, res) => resolve(res || [])));
    const oldResources = await new Promise((resolve) => db.query('SELECT file_url FROM project_resources', (err, res) => resolve(res || [])));
    
    const incomingFiles = new Set();
    if (projects) {
      projects.forEach(project => {
        if (Array.isArray(project.images)) {
          project.images.forEach(url => incomingFiles.add(normalizeStoredFileUrl(url)));
        }
        if (Array.isArray(project.resources)) {
          project.resources.forEach(resource => {
            if (resource.file_url) incomingFiles.add(normalizeStoredFileUrl(resource.file_url));
          });
        }
      });
    }

    const allOldFiles = [
      ...oldImages.map(img => img.image_url),
      ...oldResources.map(resource => resource.file_url)
    ];

    allOldFiles.forEach(fileUrl => {
      const publicFileUrl = normalizeStoredFileUrl(fileUrl);
      if (fileUrl && !incomingFiles.has(publicFileUrl)) {
        const filename = getUploadFilename(fileUrl);
        if (!filename) return;
        const filepath = path.join(uploadsDir, filename);
        if (fs.existsSync(filepath)) {
          try { fs.unlinkSync(filepath); } catch (e) {}
        }
      }
    });

    await new Promise((resolve, reject) => db.query('DELETE FROM project_images', (err) => err ? reject(err) : resolve()));
    await new Promise((resolve, reject) => db.query('DELETE FROM project_resources', (err) => err ? reject(err) : resolve()));
    await new Promise((resolve, reject) => db.query('DELETE FROM projects', (err) => err ? reject(err) : resolve()));

    if (projects && projects.length > 0) {
      for (let i = 0; i < projects.length; i++) {
        const p = projects[i];
        const techs = JSON.stringify(p.technologies || []);
        
        const insertProj = await new Promise((resolve, reject) => {
          db.query('INSERT INTO projects (title, category, description, technologies) VALUES (?, ?, ?, ?)',
            [p.title, p.category, p.description, techs], (err, result) => err ? reject(err) : resolve(result));
        });

        const newProjectId = insertProj.insertId;

        if (p.images && p.images.length > 0) {
          for (let imgIndex = 0; imgIndex < p.images.length; imgIndex++) {
            await new Promise((resolve, reject) => {
              db.query(
                'INSERT INTO project_images (project_id, image_url, display_order) VALUES (?, ?, ?)',
                [newProjectId, p.images[imgIndex], imgIndex],
                (err) => err ? reject(err) : resolve()
              );
            });
          }
        }

        if (p.resources && p.resources.length > 0) {
          for (const resource of p.resources) {
            await new Promise((resolve, reject) => {
              db.query(
                'INSERT INTO project_resources (project_id, title, type, file_url) VALUES (?, ?, ?, ?)',
                [newProjectId, resource.title, resource.type, resource.file_url],
                (err) => err ? reject(err) : resolve()
              );
            });
          }
        }
      }
    }
    res.json({ message: 'Projets sauvegardés et nettoyage effectué !' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', (req, res) => {
  const { title, category, description, technologies } = req.body;
  const techJson = JSON.stringify(technologies || []);
  db.query('INSERT INTO projects (title, category, description, technologies) VALUES (?, ?, ?, ?)', [title, category, description, techJson], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ message: 'Projet ajouté avec succès', id: result.insertId });
  });
});

app.put('/api/projects/:id', (req, res) => {
  const { title, category, description, technologies } = req.body;
  const techJson = JSON.stringify(technologies || []);
  db.query('UPDATE projects SET title = ?, category = ?, description = ?, technologies = ? WHERE id = ?', [title, category, description, techJson, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Projet mis à jour avec succès' });
  });
});

app.delete('/api/projects/:id', (req, res) => {
  db.query('DELETE FROM projects WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Projet supprimé avec succès' });
  });
});

app.post('/api/messages', (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Tous les champs sont requis.' });

  db.query('INSERT INTO messages (name, email, message) VALUES (?, ?, ?)', [name, email, message], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ message: 'Message envoyé avec succès !' });
  });
});

app.get('/api/messages', (req, res) => {
  db.query('SELECT * FROM messages ORDER BY created_at DESC', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.delete('/api/messages/:id', (req, res) => {
  db.query('DELETE FROM messages WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Message supprimé' });
  });
});

// ==========================================
// 5. LANCEMENT DU SERVEUR (Uniquement en local)
// ==========================================
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  });
}
module.exports = app;