-- Digital Lending Apply: seed licence_application_templates.form_schema (ML-A1, ML-A3, NDT-A1, NDT-A2, NDT-A3, NDT-A6).
-- Idempotent (plain UPDATEs keyed by application_key + external_id). Requires 0101.
-- The same JSON is bundled in src/app/apply/digital-lending/dl-schemas.ts, which the
-- app falls back to when form_schema is empty, so editing it here is how admins tune
-- labels / required rules without a deploy. Block kinds are documented in dl-schemas.ts.

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "fields",
   "cols": 2,
   "fields": [
    {
     "key": "legalName",
     "label": "Company legal name"
    },
    {
     "key": "regNo",
     "label": "Registration number"
    },
    {
     "key": "tin",
     "label": "Company TIN"
    }
   ]
  },
  {
   "kind": "upload",
   "slot": "incorp",
   "label": "Certificate of Incorporation",
   "required": true
  },
  {
   "kind": "upload",
   "slot": "constitution",
   "label": "Memorandum & Articles / incorporation documents",
   "required": true
  },
  {
   "kind": "upload",
   "slot": "tin",
   "label": "TIN registration certificate",
   "required": true
  }
 ],
 "save_label": "Save details",
 "caption": {
  "kind": "files"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'ML-A1';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "fields",
   "cols": 1,
   "fields": [
    {
     "key": "physical",
     "label": "Registered physical address"
    },
    {
     "key": "postal",
     "label": "Postal address"
    },
    {
     "key": "area",
     "label": "Proposed area of operation"
    }
   ]
  },
  {
   "kind": "fields",
   "cols": 2,
   "fields": [
    {
     "key": "officePhone",
     "label": "Principal-office phone"
    },
    {
     "key": "officeEmail",
     "label": "Principal-office email"
    }
   ]
  }
 ],
 "save_label": "Save details",
 "caption": {
  "kind": "files"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'ML-A3';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "choice",
   "key": "legalForm",
   "label": "Applicant legal form",
   "required": true,
   "options": [
    {
     "value": "company",
     "label": "Company"
    },
    {
     "value": "ngo",
     "label": "Non-governmental organisation"
    }
   ]
  },
  {
   "kind": "fields",
   "cols": 2,
   "fields": [
    {
     "key": "legalName",
     "label": "Legal name"
    },
    {
     "key": "regNo",
     "label": "Registration number"
    }
   ]
  },
  {
   "kind": "upload",
   "slot": "registration",
   "label": "Certificate of Incorporation",
   "labelIf": {
    "key": "legalForm",
    "map": {
     "ngo": "NGO registration certificate"
    }
   },
   "required": true
  },
  {
   "kind": "upload",
   "slot": "constitution",
   "label": "Memorandum & Articles / incorporation documents",
   "labelIf": {
    "key": "legalForm",
    "map": {
     "ngo": "Constitution / incorporation documents"
    }
   },
   "required": true
  }
 ],
 "save_label": "Save details",
 "caption": {
  "kind": "files"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'NDT-A1';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "fields",
   "cols": 1,
   "fields": [
    {
     "key": "description",
     "label": "Describe the management and administrative structure",
     "type": "textarea"
    }
   ]
  },
  {
   "kind": "upload",
   "slot": "structure",
   "label": "Organisation chart / management structure",
   "required": true
  }
 ],
 "save_label": "Save details",
 "caption": {
  "kind": "files"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'NDT-A2';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "fields",
   "cols": 2,
   "fields": [
    {
     "key": "headPhysical",
     "label": "Head-office physical address"
    },
    {
     "key": "headPostal",
     "label": "Postal address"
    },
    {
     "key": "email",
     "label": "Email"
    },
    {
     "key": "phone",
     "label": "Telephone"
    }
   ]
  },
  {
   "kind": "check",
   "key": "noExisting",
   "label": "The applicant has no existing place of business yet.",
   "saveOnToggle": true
  },
  {
   "kind": "when",
   "cond": {
    "key": "noExisting",
    "ne": true
   },
   "blocks": [
    {
     "kind": "repeater",
     "key": "places",
     "cardClass": "place-card",
     "itemLabel": "Place of business",
     "addLabel": "+ Add place of business",
     "cols": 2,
     "min": 1,
     "fields": [
      {
       "key": "name",
       "label": "Name / branch"
      },
      {
       "key": "address",
       "label": "Address"
      },
      {
       "key": "year",
       "label": "Year established"
      },
      {
       "key": "years",
       "label": "Years in operation"
      }
     ]
    }
   ]
  }
 ],
 "save_label": "Save details",
 "caption": {
  "kind": "offices"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'NDT-A3';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "section",
   "title": "Capital information",
   "blocks": [
    {
     "kind": "fields",
     "cols": 2,
     "fields": [
      {
       "key": "core",
       "label": "Core capital"
      },
      {
       "key": "permanent",
       "label": "Permanent / non-withdrawable capital"
      },
      {
       "key": "redeemable",
       "label": "Redeemable capital"
      },
      {
       "key": "institutional",
       "label": "Institutional capital"
      }
     ]
    }
   ]
  },
  {
   "kind": "section",
   "title": "Banker",
   "blocks": [
    {
     "kind": "choice",
     "key": "hasBanker",
     "required": true,
     "options": [
      {
       "value": "yes",
       "label": "Has banker"
      },
      {
       "value": "no",
       "label": "No banker"
      }
     ]
    },
    {
     "kind": "when",
     "cond": {
      "key": "hasBanker",
      "eq": "yes"
     },
     "mt": 12,
     "blocks": [
      {
       "kind": "fields",
       "cols": 2,
       "fields": [
        {
         "key": "bankerName",
         "label": "Banker name"
        },
        {
         "key": "bankerAddress",
         "label": "Banker address"
        }
       ]
      }
     ]
    }
   ]
  },
  {
   "kind": "section",
   "title": "Auditor",
   "blocks": [
    {
     "kind": "fields",
     "cols": 2,
     "fields": [
      {
       "key": "auditorName",
       "label": "Auditor name"
      },
      {
       "key": "auditorDate",
       "label": "Appointment date",
       "type": "date",
       "required": true
      }
     ]
    }
   ]
  }
 ],
 "save_label": "Save details"
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'NDT-A6';
