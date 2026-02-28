const IndexingPipeline = require('../src/pipeline');
const path = require('path');
const fs = require('fs');

const testPath = path.resolve(__dirname, '../data/test-project');

if (!fs.existsSync(testPath)) {
  fs.mkdirSync(testPath, { recursive: true });
  fs.writeFileSync(path.join(testPath, 'users.route.js'), `
    const express = require('express');
    const router = express.Router();
    
    /**
     * @api {get} /users Get all users
     */
    router.get('/users', async (req, res) => {
      const users = await User.find();
      res.json(users);
    });

    router.post('/users/:id', (req, res) => {
      const { id } = req.params;
      const { name } = req.body;
      UserService.create(id, name);
      res.status(201).send();
    });

    module.exports = router;
  `);

  fs.writeFileSync(path.join(testPath, 'posts.route.js'), `
    const express = require('express');
    const router = express.Router();
    
    /**
     * @api {get} /posts Get all posts
     */
    router.get('/posts', async (req, res) => {
      const posts = await Post.find();
      res.json(posts);
    });

    router.post('/posts', (req, res) => {
      const { title, content } = req.body;
      PostService.create(title, content);
      res.status(201).send();
    });

    module.exports = router;
  `);
}

console.log(`Running test on: ${testPath}`);
const pipeline = new IndexingPipeline(testPath);
pipeline.run().then(() => {
  console.log('✅ Test complete!');
}).catch(console.error);
