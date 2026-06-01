import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axios';

export default function ReglementInterieur() {
  const handleClose = () => {
    window.close();
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
      padding: '32px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      <div style={{
        maxWidth: 900,
        margin: '0 auto',
        background: 'white',
        borderRadius: 16,
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%)',
          color: 'white',
          padding: '40px 32px',
          textAlign: 'center'
        }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: 32, fontWeight: 700 }}>Règlement Intérieur</h1>
          <p style={{ margin: 0, fontSize: 16, opacity: 0.9 }}>Association AMC & PARTAGE</p>
        </div>

        {/* Content */}
        <div style={{ padding: '40px 32px' }}>
          {/* Intro Box */}
          <div style={{
            background: '#FEE2E2',
            border: '2px solid #DC2626',
            borderRadius: 12,
            padding: 20,
            marginBottom: 32,
            fontWeight: 600,
            color: '#991B1B'
          }}>
            « Les cours dispensés à l'association est un engagement sur toute l'année et ne sont pas facultatifs »
          </div>

          {/* Preamble */}
          <div style={{
            background: '#F0F9FF',
            border: '1px solid #0284C7',
            borderRadius: 12,
            padding: 20,
            marginBottom: 32,
            lineHeight: 1.6,
            color: '#0C4A6E'
          }}>
            <p>
              Le présent règlement intérieur a pour objectif de garantir les conditions nécessaires au maintien d'un climat de confiance, de respect et de discipline au sein de l'établissement. Il doit être lu attentivement par les parents avec leurs enfants ou par l'étudiant lui-même. La signature de ce règlement vaut engagement explicite à respecter l'ensemble de ses dispositions.
            </p>
          </div>

          {/* Section 1 */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#1D4ED8',
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: '2px solid #DBEAFE'
            }}>1. Inscription / Frais d'inscription</h2>
            <ul style={{ lineHeight: 1.8, color: '#374151', fontSize: 15 }}>
              <li>L'inscription devient définitive lorsque le dossier d'inscription est complet et que les frais ont été réglés intégralement (ou partiellement après accord de l'association).</li>
              <li>De plus, toute dette de paiement antérieure à l'année à venir ne permettra pas la réinscription.</li>
              <li>Tout élève mineur (moins de 18 ans) doit être muni d'une autorisation parentale (ou du représentant légal) afin de pouvoir s'inscrire. Les frais doivent être réglés avant l'entrée en classe.</li>
              <li>En cas de chèque sans provision, la situation doit être réglée dans les plus brefs délais. Les frais liés au rejet du paiement restent à la charge de l'élève ou des parents.</li>
              <li>Dans certains cas, le règlement peut être effectué plusieurs fois en espèces, sous réserve de fournir un chèque de garantie correspondant au montant total dû.</li>
              <li>Toute inscription aux cours est considérée comme définitive et engageante. Aucun arrêt en cours d'année, aucun changement de classe ou remplacement par une autre personne ne sera accepté.</li>
              <li>Toute interruption des cours ou inscription tardive ne donnera lieu à aucune réduction des frais d'inscription. Toute demande de remboursement après un mois suivant le début des cours sera refusée.</li>
            </ul>
          </div>

          {/* Section 2 */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#059669',
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: '2px solid #D1FAE5'
            }}>2. Carnet de correspondance</h2>
            <ul style={{ lineHeight: 1.8, color: '#374151', fontSize: 15 }}>
              <li>Chaque élève doit posséder un carnet de correspondance qu'il doit conserver en permanence avec lui.</li>
              <li>Ce carnet constitue un outil essentiel de travail et de communication entre l'équipe pédagogique, l'élève/l'étudiant et les parents.</li>
              <li>Les parents doivent consulter le carnet de correspondance dès le retour de leur enfant du centre et répondre aux messages qui leur sont adressés. Le carnet doit être présenté à toute demande d'un membre de l'équipe pédagogique.</li>
            </ul>
          </div>

          {/* Section 3 */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#DC2626',
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: '2px solid #FEE2E2'
            }}>3. Travail scolaire / Assiduité et discipline</h2>
            <ul style={{ lineHeight: 1.8, color: '#374151', fontSize: 15 }}>
              <li>La répartition des élèves au sein des différents groupes ainsi que l'attribution des enseignants sont établies par l'équipe pédagogique en fonction des besoins éducatifs, du niveau des élèves et des objectifs pédagogiques fixés.</li>
              <li>Le passage de l'élève au niveau supérieur et le choix des professeurs sont décidés par l'équipe pédagogique.</li>
              <li><strong>La ponctualité est un devoir religieux et scolaire.</strong></li>
              <li>Les horaires d'entrée et de sortie sont définis dans l'emploi du temps remis lors de l'inscription.</li>
              <li>Les élèves doivent être prêts à rentrer en classe 5 minutes avant le début du cours.</li>
              <li><strong>L'accès aux cours pourra être refusé à tout élève ayant plus de 10 minutes de retard.</strong></li>
              <li>Les parents doivent récupérer leurs enfants mineurs immédiatement après la fin des cours.</li>
              <li>Aucun enfant de moins de 11 ans ne sera autorisé à quitter seul l'établissement sans autorisation écrite. Il faut remplir le formulaire dédié auprès du secrétariat directement ou par email : <strong>education@musulmansdeclamart.fr</strong></li>
              <li>Toute absence doit être signalée à l'avance par téléphone ou par e-mail au Pôle Éducation.</li>
              <li>En cas d'absences répétées, le conseil pédagogique se réserve le droit d'exclure définitivement l'élève. En cas d'absence, l'élève devra rattraper les cours et les travaux demandés.</li>
              <li>L'élève doit apporter son matériel scolaire tout au long de l'année.</li>
            </ul>

            <div style={{
              background: '#FEF3C7',
              border: '1px solid #F59E0B',
              borderRadius: 12,
              padding: 16,
              marginTop: 20,
              marginBottom: 20
            }}>
              <h3 style={{ marginTop: 0, marginBottom: 12, color: '#92400E', fontSize: 16 }}>Règles supplémentaires pour Cours de Coran</h3>
              <ul style={{ lineHeight: 1.8, color: '#78350F', fontSize: 14, marginTop: 0 }}>
                <li>L'assiduité est essentielle au bon suivi de l'apprentissage. Toute absence devra obligatoirement être justifiée par e-mail.</li>
                <li>Seuls les justificatifs suivants seront acceptés : billet d'avion/train ou certificat médical. Après cinq absences non justifiées, l'élève sera exclu définitivement du cours, sans possibilité de remboursement.</li>
                <li>Toute situation exceptionnelle sera étudiée au cas par cas par le responsable pédagogique.</li>
              </ul>
            </div>
          </div>

          {/* Section 4 */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#7C3AED',
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: '2px solid #EDE9FE'
            }}>4. Comportement, sécurité et hygiène</h2>
            <ul style={{ lineHeight: 1.8, color: '#374151', fontSize: 15 }}>
              <li>L'échange des salutations fait partie des valeurs du musulman et doit être respecté par tous.</li>
              <li><strong>Aucune atteinte à la dignité, à la sécurité physique ou morale ne sera tolérée au sein de l'établissement.</strong></li>
              <li>Il est strictement interdit de manger ou de mâcher du chewing-gum pendant les heures de cours.</li>
              <li>Les élèves doivent veiller à la propreté des locaux et respecter les consignes de sécurité.</li>
              <li>L'utilisation de l'ascenseur est réservée aux personnes prioritaires et interdit aux mineurs non accompagnés d'un adulte.</li>
              <li>Il est interdit d'introduire tout objet dangereux ou susceptible de perturber le bon fonctionnement du centre.</li>
              <li>Le personnel pédagogique n'est pas autorisé à administrer des médicaments ou des soins aux élèves.</li>
              <li>Il est demandé à tous circuler dans l'établissement dans le calme et le respect.</li>
            </ul>
          </div>

          {/* Section 5 */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#DC2626',
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: '2px solid #FEE2E2'
            }}>5. Sanctions</h2>
            <div style={{
              background: '#FEE2E2',
              border: '1px solid #DC2626',
              borderRadius: 12,
              padding: 16,
              lineHeight: 1.8,
              color: '#7F1D1D'
            }}>
              <p style={{ margin: 0 }}>
                Le non-respect du présent règlement intérieur pourra entraîner des sanctions pouvant aller jusqu'à l'exclusion temporaire ou définitive de l'élève sans aucun remboursement possible. Les sanctions varient selon la gravité des faits constatés : avertissement, travaux éducatifs, TIG ou convocation des parents.
              </p>
            </div>
          </div>

          {/* Section 6 */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#0891B2',
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: '2px solid #CFFAFE'
            }}>6. Responsabilité et confidentialité</h2>
            <ul style={{ lineHeight: 1.8, color: '#374151', fontSize: 15 }}>
              <li>L'association décline toute responsabilité en cas de vol, perte ou détérioration des effets personnels des élèves ou étudiants. Les dommages ou perte de fournitures scolaires restent sous la responsabilité de l'élève ou des parents. Les objets trouvés doivent être remis ou réclamés auprès des membres de l'équipe pédagogique.</li>
              <li>Les élèves mineurs demeurent sous la responsabilité de leurs parents avant et après les horaires de cours et ils ne doivent pas être seuls dans l'espace culturel jusqu'à l'arrivée de l'enseignant.</li>
              <li>En cas d'accident résultant du non-respect des consignes, la responsabilité de l'établissement ne pourra être engagée.</li>
            </ul>

            <div style={{
              background: '#F3F4F6',
              border: '1px solid #D1D5DB',
              borderRadius: 12,
              padding: 16,
              marginTop: 20,
              fontSize: 13,
              color: '#4B5563',
              lineHeight: 1.6
            }}>
              <p style={{ margin: 0 }}>
                <strong>Données personnelles :</strong> Les informations recueillies sont nécessaires pour votre inscription. Elles font l'objet d'un traitement informatique et sont destinées au secrétariat de l'association. En appliquant le chapitre V de la loi « Informatique et libertés » du 6 janvier 1978 modifiée, vous bénéficiez d'un droit d'accès, de modification, de rectification et de suspension des données qui vous concerne. Si vous souhaitez exercer ce droit et obtenir communication des informations vous concernant, veuillez-vous adresser à <strong>education@musulmansdeclamart.fr</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Footer with Close Button */}
        <div style={{
          background: '#F8FAFC',
          borderTop: '1px solid #E2E8F0',
          padding: '24px 32px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16
        }}>
          <div style={{
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <img src="/amc_logo.png" alt="AMC" style={{ height: 32, objectFit: 'contain' }} />
            <img src="/amc_logo_partner.png" alt="PARTAGE" style={{ height: 32, objectFit: 'contain' }} />
          </div>
          <div style={{ fontWeight: 700, color: '#1F2937' }}>Association AMC & PARTAGE</div>
          <div style={{ color: '#6B7280', fontSize: 13 }}>92140 Clamart, France</div>

          <button
            onClick={handleClose}
            style={{
              marginTop: 16,
              padding: '10px 24px',
              background: '#1D4ED8',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.3s ease'
            }}
            onMouseOver={(e) => e.target.style.background = '#1E40AF'}
            onMouseOut={(e) => e.target.style.background = '#1D4ED8'}
          >
            Fermer l'onglet
          </button>
        </div>
      </div>
    </div>
  );
}
