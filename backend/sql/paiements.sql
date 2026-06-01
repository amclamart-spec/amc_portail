-- Table de suivi des paiements SEPA "Mandat d'abord, paiement ensuite"
CREATE TABLE paiements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inscription_id INT NOT NULL,
  stripe_payment_intent_id VARCHAR(255) NULL,
  stripe_payment_method_id VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL,
  stripe_mandate_id VARCHAR(255) NULL,
  montant DECIMAL(10,2) NOT NULL,
  statut ENUM('mandate_signed', 'processing', 'succeeded', 'failed', 'disputed', 'requires_capture') NOT NULL DEFAULT 'mandate_signed',
  echeance_numero INT NOT NULL DEFAULT 1,
  due_date DATETIME NOT NULL,
  failure_reason TEXT NULL,
  date_creation DATETIME NOT NULL DEFAULT NOW(),
  date_mise_a_jour DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW()
);

ALTER TABLE paiements
  ADD INDEX idx_stripe_payment_intent_id (stripe_payment_intent_id),
  ADD INDEX idx_inscription_id (inscription_id);