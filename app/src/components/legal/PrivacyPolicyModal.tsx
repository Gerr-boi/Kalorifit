import { X } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export default function PrivacyPolicyModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Personvernerklæring</h2>
            <p className="text-xs text-gray-500 dark:text-zinc-400">Sist oppdatert: april 2026</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-gray-600 dark:text-zinc-300" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-5 py-4 space-y-5 text-sm text-gray-700 dark:text-zinc-300 leading-relaxed">

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">1. Hvem er ansvarlig</h3>
            <p>
              KaloriFit er behandlingsansvarlig for personopplysninger du oppgir ved bruk av appen.
              Ved spørsmål kan du kontakte oss på <span className="font-medium text-orange-500">personvern@kalorifit.no</span>.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">2. Hvilke opplysninger vi samler inn</h3>
            <ul className="list-disc pl-4 space-y-1">
              <li><span className="font-medium">Kontoinformasjon:</span> E-postadresse og kryptert passord ved registrering.</li>
              <li><span className="font-medium">Helse- og treningsdata:</span> Vekt, høyde, alder, kjønn, kostholdslogger, aktivitetsnivå og ernæringsmål som du selv registrerer.</li>
              <li><span className="font-medium">Enhetsdata:</span> Nettlesertype og språkinnstillinger.</li>
              <li><span className="font-medium">Bruksdata:</span> Hvilke funksjoner du bruker, for å forbedre appen.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">3. Formål og rettslig grunnlag</h3>
            <ul className="list-disc pl-4 space-y-1">
              <li><span className="font-medium">Oppfylle avtalen med deg</span> (GDPR art. 6(1)(b)): Lagre preferanser, synkronisere data og tilby personlig ernæringsrådgivning.</li>
              <li><span className="font-medium">Samtykke</span> (GDPR art. 6(1)(a) og art. 9(2)(a)): Behandling av helserelaterte data (vekt, ernæring) basert på ditt eksplisitte samtykke.</li>
              <li><span className="font-medium">Berettiget interesse</span> (GDPR art. 6(1)(f)): Statistikk for å forbedre appens funksjonalitet.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">4. Lagring og sikkerhet</h3>
            <p>
              Data lagres lokalt på enheten din (localStorage) og i skyen via{' '}
              <span className="font-medium">Supabase</span> (EU-servere). Alle overføringer skjer kryptert via HTTPS.
              Vi benytter tilgangskontroll og logger for å begrense intern tilgang til dine data.
              Dataene beholdes så lenge kontoen er aktiv. Sletter du kontoen, slettes all data innen 30 dager.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">5. Deling med tredjeparter</h3>
            <ul className="list-disc pl-4 space-y-1">
              <li><span className="font-medium">Supabase Inc.</span> — skylagring og autentisering (databehandleravtale inngått).</li>
              <li>Vi selger ikke dine personopplysninger til noen.</li>
              <li>Vi deler ikke data med annonsører.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">6. Dine rettigheter (GDPR)</h3>
            <ul className="list-disc pl-4 space-y-1">
              <li><span className="font-medium">Innsyn:</span> Be om kopi av dataene vi har om deg.</li>
              <li><span className="font-medium">Retting:</span> Korriger unøyaktige opplysninger direkte i appen.</li>
              <li><span className="font-medium">Sletting:</span> Slett kontoen din via Profil → Slett konto. All data fjernes.</li>
              <li><span className="font-medium">Dataportabilitet:</span> Be om eksport av dine data.</li>
              <li><span className="font-medium">Trekk tilbake samtykke:</span> Kan gjøres når som helst uten at det påvirker tidligere behandling.</li>
            </ul>
            <p className="mt-2">
              Du kan også klage til <span className="font-medium">Datatilsynet</span> (datatilsynet.no) dersom du mener vi behandler data ulovlig.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">7. Kontakt</h3>
            <p>
              E-post: <span className="font-medium text-orange-500">personvern@kalorifit.no</span>
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-zinc-800 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-xl text-sm transition-colors"
          >
            Lukk
          </button>
        </div>
      </div>
    </div>
  );
}
