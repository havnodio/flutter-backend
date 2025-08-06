const bcrypt = require('bcryptjs');

(async () => {
  const plainPassword = 'admin'; // ← this is the password you want to use
  const hash = await bcrypt.hash(plainPassword, 10);
  console.log('Hashed password:', hash);
})();
