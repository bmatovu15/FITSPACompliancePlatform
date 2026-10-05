-- Digital Lending Apply: seed licence_application_templates.form_schema (DL-A5, DL-A7, DL-A8, DL-A9, DL-A10, ML-S1, ML-S2, NDT-S1, NDT-S2).
-- Idempotent (plain UPDATEs keyed by application_key + external_id). Requires 0101.
-- The same JSON is bundled in src/app/apply/digital-lending/dl-schemas.ts, which the
-- app falls back to when form_schema is empty, so editing it here is how admins tune
-- labels / required rules without a deploy. Block kinds are documented in dl-schemas.ts.

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "fields",
   "cols": 1,
   "fields": [
    {
     "key": "systemDescription",
     "label": "Describe the ICT system used to deliver and manage digital credit",
     "type": "textarea"
    }
   ]
  },
  {
   "kind": "section",
   "title": "Delivery channels",
   "blocks": [
    {
     "kind": "checkArray",
     "key": "channels",
     "min": 1,
     "options": [
      "App",
      "Web",
      "USSD",
      "Mobile money",
      "Embedded / partner channel",
      "Other"
     ]
    }
   ]
  },
  {
   "kind": "section",
   "title": "Third-party channel provider",
   "blocks": [
    {
     "kind": "text",
     "text": "Does a telecom company or another service provider supply or operate any of these channels or platforms?"
    },
    {
     "kind": "choice",
     "key": "provider",
     "required": true,
     "mt": 10,
     "options": [
      {
       "value": "yes",
       "label": "Yes"
      },
      {
       "value": "no",
       "label": "No"
      }
     ]
    },
    {
     "kind": "when",
     "cond": {
      "key": "provider",
      "eq": "yes"
     },
     "mt": 12,
     "blocks": [
      {
       "kind": "fields",
       "cols": 1,
       "fields": [
        {
         "key": "providerName",
         "label": "Provider name"
        }
       ]
      },
      {
       "kind": "upload",
       "slot": "providerAgreement",
       "label": "Provider agreement",
       "required": true
      }
     ]
    }
   ]
  },
  {
   "kind": "section",
   "title": "App / trading name",
   "blocks": [
    {
     "kind": "text",
     "text": "Will any loan app or trading name differ from the applicant's registered legal name?"
    },
    {
     "kind": "choice",
     "key": "differentName",
     "required": true,
     "mt": 10,
     "options": [
      {
       "value": "yes",
       "label": "Yes"
      },
      {
       "value": "no",
       "label": "No"
      }
     ]
    },
    {
     "kind": "when",
     "cond": {
      "key": "differentName",
      "eq": "yes"
     },
     "mt": 12,
     "blocks": [
      {
       "kind": "fields",
       "cols": 1,
       "fields": [
        {
         "key": "tradingName",
         "label": "Trading / app name"
        }
       ]
      }
     ]
    }
   ]
  }
 ],
 "save_label": "Save technology details",
 "caption": {
  "kind": "channels"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'DL-A5';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "upload",
   "slot": "aml",
   "label": "AML/CFT framework",
   "required": true
  },
  {
   "kind": "note",
   "text": "Use the current document that will support this application."
  }
 ],
 "caption": {
  "kind": "files"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'DL-A7';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "upload",
   "slot": "policy",
   "label": "Data protection / privacy policy & procedures",
   "required": true
  },
  {
   "kind": "upload",
   "slot": "certificate",
   "label": "PDPO Certificate of Registration",
   "required": true
  }
 ],
 "caption": {
  "kind": "files"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'DL-A8';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "upload",
   "slot": "credit",
   "label": "Credit policy",
   "required": true
  },
  {
   "kind": "note",
   "text": "Use the current document that will support this application."
  }
 ],
 "caption": {
  "kind": "files"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'DL-A9';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "multiupload",
   "label": "Add governance / conduct document(s)",
   "slotPrefix": "doc_",
   "fileLabel": "Governance / conduct document",
   "required": true
  },
  {
   "kind": "section",
   "title": "Coverage",
   "blocks": [
    {
     "kind": "checks",
     "required": true,
     "items": [
      {
       "key": "governance",
       "label": "Corporate governance"
      },
      {
       "key": "ethics",
       "label": "Code of ethics"
      },
      {
       "key": "conduct",
       "label": "Market conduct"
      }
     ]
    }
   ]
  }
 ],
 "save_label": "Save coverage",
 "caption": {
  "kind": "files"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'DL-A10';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "upload",
   "slot": "fee",
   "label": "Application fee",
   "required": true
  },
  {
   "kind": "note",
   "text": "Use the current document that will support this application."
  }
 ],
 "caption": {
  "kind": "files"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'ML-S1';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "section",
   "title": "Official form",
   "blocks": [
    {
     "kind": "text",
     "text": "Open the official Money Lender Form 1, complete and sign it, then add the final signed copy below."
    },
    {
     "kind": "link",
     "label": "Open official Form 1 ↗"
    }
   ]
  },
  {
   "kind": "upload",
   "slot": "signed",
   "label": "Signed Form 1",
   "required": true
  }
 ],
 "caption": {
  "kind": "files"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'ML-S2';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "upload",
   "slot": "fee",
   "label": "Application fee",
   "required": true
  },
  {
   "kind": "note",
   "text": "Use the current document that will support this application."
  }
 ],
 "caption": {
  "kind": "files"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'NDT-S1';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "section",
   "title": "Official form",
   "blocks": [
    {
     "kind": "text",
     "text": "Open Form 1A, complete it and the Chairperson/CEO declaration, sign it, then add the final copy below."
    },
    {
     "kind": "link",
     "label": "Open official Form 1A ↗"
    }
   ]
  },
  {
   "kind": "check",
   "key": "declarationComplete",
   "label": "Chairperson/CEO declaration completed.",
   "required": true
  },
  {
   "kind": "upload",
   "slot": "signed",
   "label": "Signed Form 1A",
   "required": true
  }
 ],
 "save_label": "Save declaration status",
 "caption": {
  "kind": "files"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'NDT-S2';
