const SibApiV3Sdk = require('@getbrevo/brevo');

// Configuration de l'API Brevo
const configureBrevoClient = () => {
  let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  let apiKey = apiInstance.authentications['apiKey'];
  apiKey.apiKey = process.env.BREVO_API_KEY;
  return apiInstance;
};

/**
 * Envoie un email au gagnant du quiz
 * @param {Object} winner - Les informations du gagnant
 * @param {string} winner.name - Nom du gagnant
 * @param {string} winner.email - Email du gagnant
 * @param {number} winner.score - Score du gagnant
 * @param {string} quizName - Nom du quiz
 * @returns {Promise} - Promesse résolue quand l'email est envoyé
 */
const sendWinnerEmail = async (winner, quizName) => {
  if (!process.env.BREVO_API_KEY) {
    console.error('Clé API Brevo non configurée. Email non envoyé.');
    return;
  }

  try {
    const apiInstance = configureBrevoClient();
    
    let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    
    sendSmtpEmail.subject = `Félicitations pour votre victoire au quiz ${quizName} !`;
    sendSmtpEmail.htmlContent = `
      <html>
        <body>
          <h1>Félicitations ${winner.name} !</h1>
          <p>Vous avez gagné le quiz "${quizName}" avec un score impressionnant de ${winner.score} points !</p>
          <p>Un lot vous sera attribué prochainement. Nous vous contacterons sous peu pour les modalités de réception.</p>
          <p>Merci pour votre participation !</p>
        </body>
      </html>
    `;
    sendSmtpEmail.sender = {
      name: 'Quiz Master',
      email: process.env.SENDER_EMAIL || 'quizmaster@example.com'
    };
    sendSmtpEmail.to = [{ email: winner.email, name: winner.name }];
    
    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('Email envoyé au gagnant:', response);
    return response;
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);
    throw error;
  }
};

module.exports = {
  sendWinnerEmail
}; 