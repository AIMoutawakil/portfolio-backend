require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ==========================================
// 1. INITIALISATION DE L'APPLICATION
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const PUBLIC_API_URL = (
  process.env.PUBLIC_API_URL || `http://localhost:${PORT}`
).replace(/\/+$/, '');

// Dossier uploads basé sur l'emplacement de server.js (chemin absolu).
const uploadsDir = path.join(__dirname, 'uploads');

// ==========================================
// 2. CONFIGURATION DES UPLOADS (Multer)
// ==========================================
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Nom unique pour éviter les doublons courants.
    cb(null, 'file-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Rendre les images et fichiers accessibles publiquement sur Internet.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Construit l'URL publique d'un fichier envoyé dans /uploads.
function getPublicFileUrl(filename) {
  return `${PUBLIC_API_URL}/uploads/${encodeURIComponent(filename)}`;
}

// Corrige les anciennes URL localhost déjà enregistrées en base de données.
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
    // Conserver l'URL telle quelle si elle n'est pas une URL absolue valide.
  }

  return fileUrl;
}

// Récupère uniquement le nom du fichier pour empêcher toute traversée de dossier.
function getUploadFilename(fileUrl) {
  try {
    return path.basename(new URL(fileUrl, PUBLIC_API_URL).pathname);
  } catch (err) {
    return '';
  }
}

// ==========================================
// AUTHENTIFICATION ADMIN
// ==========================================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    res.json({ success: true, message: 'Authentification réussie' });
  } else {
    res.status(401).json({ success: false, message: 'Identifiants incorrects' });
  }
});

// ==========================================
// 3. CONNEXION À LA BASE DE DONNÉES
// ==========================================
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error('❌ Erreur de connexion:', err);
    return;
  }
  console.log('✅ Connecté avec succès à la base de données MySQL (portfolio_db)');
});

// ==========================================
// 🚀 ROUTES DE L'API REST
// ==========================================

// Route de test
app.get('/', (req, res) => {
  res.send('Le serveur API de Moutawakil Imrane est en ligne !');
});


// ==========================================
// ⚙️ PARAMÈTRES GLOBAUX (Accueil / Contact)
// ==========================================
app.get('/api/settings', (req, res) => {
  db.query('SELECT * FROM page_settings WHERE id = 1', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const settings = results[0] || {};
    settings.cv_url = normalizeStoredFileUrl(settings.cv_url);

    // Sécurité : On transforme le texte SQL en vrai tableau JavaScript
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
  
  // On transforme le tableau React en texte pour MySQL
  const linksJson = JSON.stringify(social_links || []);
  const publicCvUrl = normalizeStoredFileUrl(cv_url);

  const sql = `UPDATE page_settings SET hero_greeting = ?, hero_name = ?, hero_title = ?, hero_description = ?, contact_email = ?, contact_location = ?, cv_url = ?, social_links = ? WHERE id = 1`;

  db.query(sql, [hero_greeting, hero_name, hero_title, hero_description, contact_email, contact_location, publicCvUrl, linksJson], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Paramètres mis à jour avec succès' });
  });
});


// ==========================================
// 👨‍🔧 PROFIL TECHNIQUE (À propos)
// ==========================================
app.get('/api/about', (req, res) => {
  db.query('SELECT * FROM about_settings WHERE id = 1', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results[0] || {});
  });
});

app.put('/api/about', (req, res) => {
  const { about_text_1, about_text_2, tools_list, skill_1_title, skill_1_desc, skill_2_title, skill_2_desc, skill_3_title, skill_3_desc } = req.body;
  const sql = `UPDATE about_settings SET about_text_1 = ?, about_text_2 = ?, tools_list = ?, skill_1_title = ?, skill_1_desc = ?, skill_2_title = ?, skill_2_desc = ?, skill_3_title = ?, skill_3_desc = ? WHERE id = 1`;
  
  db.query(sql, [about_text_1, about_text_2, tools_list, skill_1_title, skill_1_desc, skill_2_title, skill_2_desc, skill_3_title, skill_3_desc], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Profil technique mis à jour avec succès' });
  });
});


// ==========================================
// 📁 UPLOAD DE FICHIERS
// ==========================================
app.post('/api/upload-cv', upload.single('cv_file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Aucun fichier reçu" });
  }
  const fileUrl = getPublicFileUrl(req.file.filename);
  res.json({ cv_url: fileUrl });
});

// NOUVELLE ROUTE : Upload de fichiers pour les projets (Images, PDF, PPT)
app.post('/api/upload-project-file', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Aucun fichier reçu" });
  }
  // On crée l'URL complète vers le fichier
  const fileUrl = getPublicFileUrl(req.file.filename);
  
  // On renvoie l'URL au front-end React
  res.json({ url: fileUrl });
});


// ==========================================
// 🛠️ MATRICE DE COMPÉTENCES (Skills)
// ==========================================
app.get('/api/skills', (req, res) => {
  const sqlCategories = 'SELECT * FROM skill_categories ORDER BY display_order ASC';
  const sqlSkills = 'SELECT * FROM skills ORDER BY display_order ASC';

  db.query(sqlCategories, (err, categories) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.query(sqlSkills, (err, skills) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const fullCategories = categories.map(cat => {
        return {
          ...cat,
          skills: skills.filter(skill => skill.category_id === cat.id)
        };
      });
      
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
  const sql = 'INSERT INTO skill_categories (title) VALUES (?)';
  db.query(sql, [title], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Catégorie ajoutée', id: result.insertId });
  });
});

app.delete('/api/skills/categories/:id', (req, res) => {
  const sql = 'DELETE FROM skill_categories WHERE id = ?';
  db.query(sql, [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Catégorie supprimée' });
  });
});

app.post('/api/skills/items', (req, res) => {
  const { category_id, name, percentage } = req.body;
  const sql = 'INSERT INTO skills (category_id, name, percentage) VALUES (?, ?, ?)';
  db.query(sql, [category_id, name, percentage], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Compétence ajoutée', id: result.insertId });
  });
});

app.delete('/api/skills/items/:id', (req, res) => {
  const sql = 'DELETE FROM skills WHERE id = ?';
  db.query(sql, [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Compétence supprimée' });
  });
});


// ==========================================
// 🚀 GESTION DES PROJETS
// ==========================================
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
        
        const fullProjects = projects.map(project => {
          return {
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
          };
        });
        res.json(fullProjects);
      });
    });
  });
});

// SAUVEGARDE GLOBALE (BULK) - AVEC IMAGES ET RESSOURCES
// SAUVEGARDE GLOBALE (BULK) - AVEC SUPPRESSION PHYSIQUE DES FICHIERS
app.put('/api/projects/bulk', async (req, res) => {
  const { projects } = req.body;
  
  try {
    // --- 1. IDENTIFIER LES FICHIERS À SUPPRIMER PHYSIQUEMENT ---
    // On récupère les anciens fichiers avant de vider les tables
    const oldImages = await new Promise((resolve) => db.query('SELECT image_url FROM project_images', (err, res) => resolve(res || [])));
    const oldResources = await new Promise((resolve) => db.query('SELECT file_url FROM project_resources', (err, res) => resolve(res || [])));
    
    // On liste tous les fichiers entrants (ceux que tu as gardés)
    const incomingFiles = new Set();
    if (projects) {
      projects.forEach(project => {
        if (Array.isArray(project.images)) {
          project.images.forEach(url => incomingFiles.add(normalizeStoredFileUrl(url)));
        }
        if (Array.isArray(project.resources)) {
          project.resources.forEach(resource => {
            if (resource.file_url) {
              incomingFiles.add(normalizeStoredFileUrl(resource.file_url));
            }
          });
        }
      });
    }

    // Supprimer physiquement uniquement les anciens fichiers qui ne sont plus utilisés.
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
          fs.unlinkSync(filepath);
        }
      }
    });

    // --- 2. METTRE À JOUR LA BASE DE DONNÉES ---
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
  const sql = 'INSERT INTO projects (title, category, description, technologies) VALUES (?, ?, ?, ?)';
  
  db.query(sql, [title, category, description, techJson], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ message: 'Projet ajouté avec succès', id: result.insertId });
  });
});

app.put('/api/projects/:id', (req, res) => {
  const projectId = req.params.id;
  const { title, category, description, technologies } = req.body;
  const techJson = JSON.stringify(technologies || []);
  const sql = 'UPDATE projects SET title = ?, category = ?, description = ?, technologies = ? WHERE id = ?';
  
  db.query(sql, [title, category, description, techJson, projectId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Projet mis à jour avec succès' });
  });
});

app.delete('/api/projects/:id', (req, res) => {
  const projectId = req.params.id;
  const sql = 'DELETE FROM projects WHERE id = ?';
  
  db.query(sql, [projectId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Projet supprimé avec succès' });
  });
});

// ==========================================
// ✉️ GESTION DES MESSAGES (Contact)
// ==========================================

// 1. Recevoir un message depuis le site public
app.post('/api/messages', (req, res) => {
  const { name, email, message } = req.body;
  
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  }

  const sql = 'INSERT INTO messages (name, email, message) VALUES (?, ?, ?)';
  db.query(sql, [name, email, message], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ message: 'Message envoyé avec succès !' });
  });
});

// 2. Lire les messages dans l'espace Admin
app.get('/api/messages', (req, res) => {
  const sql = 'SELECT * FROM messages ORDER BY created_at DESC';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// 3. Supprimer un message dans l'espace Admin
app.delete('/api/messages/:id', (req, res) => {
  const sql = 'DELETE FROM messages WHERE id = ?';
  db.query(sql, [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Message supprimé' });
  });
});

// ==========================================
// 4. LANCEMENT DU SERVEUR
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});

module.exports = app;