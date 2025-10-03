// Esta é uma simulação para serviços de notificação

const sendEmail = (to, subject, body) => {
    console.log(`[EMAIL SIMULAÇÃO] Enviando e-mail para: ${to}`);
    console.log(`Assunto: ${subject}`);
    console.log(`Corpo: ${body}\n---`);
};

const shareTeamsLink = (teamMembers, link) => {
    const recipients = teamMembers.map(m => m.name).join(', ');
    console.log(`[TEAMS SIMULAÇÃO] Compartilhando link da Sala de Guerra (${link}) com: ${recipients}\n---`);
};

const sendAlertToManagers = (message) => {
    const managers = ['gestor1@empresa.com', 'gestor2@empresa.com']; // Lista de e-mails/IDs dos gestores
    console.log(`[ALERTA SIMULAÇÃO] ALERTA DE SISTEMA para gestores: ${message}\n---`);
    managers.forEach(managerEmail => {
    });
};

module.exports = {
    sendEmail,
    shareTeamsLink,
    sendAlertToManagers
};