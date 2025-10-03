const MOCKED_USERS = [
    { username: 'admin', password: 'password123', name: 'Administrador', role: 'admin' },
    { username: 'user1', password: 'password', name: 'João Silva', role: 'ti' },
    { username: 'user2', password: 'password', name: 'Maria Santos', role: 'infraestrutura' },
    { username: 'user3', password: 'password', name: 'Carlos Lima', role: 'comunicacao' }
];

const loginUser = (req, res) => {
    const { username, password } = req.body;

    const user = MOCKED_USERS.find(
        u => u.username === username && u.password === password
    );

    if (user) {
        res.status(200).json({
            message: 'Login realizado com sucesso!',
            user: {
                username: user.username,
                name: user.name,
                role: user.role
            }
        });
    } else {
        res.status(401).json({ message: 'Credenciais inválidas. Por favor, tente novamente.' });
    }
};

module.exports = {
    loginUser
};