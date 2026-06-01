import { useState } from 'react';
import { useStripe, useElements, IbanElement } from '@stripe/react-stripe-js';
import api from '../api/axios';

export default function SepaSetupForm({
  clientSecret,
  montantTotal,
  nombreEcheances,
  customerId,
  nomTitulaire,
  emailTitulaire,
  paymentId,
  mandateToken,
  inscriptionId,
  dueDateFirstPayment,
  onSuccess,
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [mandatAccepted, setMandatAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!mandatAccepted) {
      setError('Vous devez accepter le mandat de prélèvement SEPA pour continuer.');
      return;
    }

    if (!stripe || !elements) {
      setError('Le paiement Stripe n\'est pas encore prêt. Veuillez réessayer.');
      return;
    }

    setLoading(true);

    try {
      const ibanElement = elements.getElement(IbanElement);
      if (!ibanElement) {
        throw new Error('Impossible de trouver le champ IBAN.');
      }

      const result = await stripe.confirmSepaDebitSetup(clientSecret, {
        payment_method: {
          sepa_debit: ibanElement,
          billing_details: {
            name: nomTitulaire,
            email: emailTitulaire,
          },
        },
      });

      if (result.error) {
        throw new Error(result.error.message || 'Erreur lors de la validation du mandat SEPA');
      }

      const paymentMethodId = result.setupIntent?.payment_method;
      const setupIntentId = result.setupIntent?.id;
      const mandateId = result.setupIntent?.mandate || null;
      if (!paymentMethodId || !setupIntentId) {
        throw new Error('Aucun paymentMethodId ou setupIntentId reçu après confirmation du mandat.');
      }

      // Sauvegarder le mandat ET la date du premier paiement
      if (!dueDateFirstPayment) {
        throw new Error('Date du premier paiement non fournie.');
      }

      const response = await api.post('/family-wizard/sepa/save-mandate', {
        paymentId,
        mandateToken,
        paymentMethodId,
        setupIntentId,
        mandateId,
        customerId,
        montant: montantTotal,
        inscriptionId,
        dueDateFirstPayment: new Date(dueDateFirstPayment).toISOString(),
      });

      if (response?.data?.success) {
        setSuccess(
          `✓ Mandat SEPA signé avec succès. Le premier prélèvement de ${montantTotal} € sera effectué le ${new Date(dueDateFirstPayment).toLocaleDateString('fr-FR')}.`
        );
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setSuccess('✓ Mandat SEPA signé et sauvegardé. Inscription finalisée.');
        if (onSuccess) {
          onSuccess();
        }
      }
    } catch (err) {
      console.error('Erreur SepaSetupForm:', err);
      setError(err.response?.data?.error || err.message || 'Erreur lors de l\'enregistrement du mandat SEPA.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="card p-4 shadow-sm" onSubmit={handleSubmit}>
      <h3 className="text-xl font-semibold mb-4">Signature du mandat SEPA</h3>

      <div className="border border-primary/20 bg-base-200 rounded-lg p-4 mb-4">
        <p className="mb-2 font-medium text-sm">🔐 Mandat de prélèvement SEPA</p>
        <p className="mb-2">
          En signant ce mandat, vous autorisez l'Association PARTAGE à prélever votre compte bancaire identifié par l'IBAN saisi ci-dessous.
        </p>
        <p className="mb-2">
          Le mandat SEPA contient les informations légales suivantes :
        </p>
        <ul className="list-disc list-inside text-sm mb-3" style={{ color: '#334155' }}>
          <li><strong>Créancier :</strong> Association PARTAGE</li>
          <li><strong>Débiteur :</strong> {nomTitulaire || 'Titulaire du compte'}</li>
          <li><strong>Email du titulaire :</strong> {emailTitulaire || 'Non renseigné'}</li>
          <li><strong>Compte bancaire (IBAN) :</strong> saisi ci-dessous</li>
          <li><strong>Montant du premier prélèvement :</strong> {montantTotal} €</li>
          <li><strong>Date prévue du premier prélèvement :</strong> {new Date(dueDateFirstPayment).toLocaleDateString('fr-FR')}</li>
          <li><strong>Échéances :</strong> {nombreEcheances > 1 ? `${nombreEcheances} prélèvements mensuels` : 'Prélèvement unique'}</li>
        </ul>
        <div className="bg-blue-50 border border-blue-200 rounded p-2 mt-3">
          <p className="font-medium text-sm text-blue-900">
            Veuillez vérifier votre IBAN avant de signer. L'IBAN figurera dans le mandat SEPA validé.
          </p>
        </div>
      </div>

      <div className="form-control mb-4">
        <label className="label">
          <span className="label-text">IBAN du compte à débiter</span>
        </label>
        <div className="input input-bordered bg-white">
          <IbanElement
            options={{ supportedCountries: ['SEPA'] }}
            onReady={() => console.log('IbanElement prêt')}
          />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          L'IBAN saisi sera affiché dans le mandat SEPA et utilisé pour le prélèvement.
        </p>
      </div>

      <div className="form-control mb-4">
        <label className="cursor-pointer label">
          <input
            type="checkbox"
            className="checkbox checkbox-primary mr-2"
            checked={mandatAccepted}
            onChange={(event) => setMandatAccepted(event.target.checked)}
          />
          <span className="label-text">J'accepte le mandat de prélèvement SEPA</span>
        </label>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}
      {success && <div className="alert alert-success mb-4">{success}</div>}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={!mandatAccepted || loading}
      >
        {loading ? 'Traitement...' : 'Valider et signer le mandat'}
      </button>
    </form>
  );
}
