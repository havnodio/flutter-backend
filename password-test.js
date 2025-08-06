const bcrypt = require('bcryptjs');

const hashedPassword = '$2a$10$6Bo6rd4shHOKZ6P0zrsAW.Fsnbl4S32SBMdHldVnmCM6qck2TGR6e';
const passwordToTest = 'yourAdminPassword'; // <-- Replace this with the password you try in the login form

bcrypt.compare(passwordToTest, hashedPassword).then(match => {
  console.log(match ? '✅ Password matches' : '❌ Password does NOT match');
});
