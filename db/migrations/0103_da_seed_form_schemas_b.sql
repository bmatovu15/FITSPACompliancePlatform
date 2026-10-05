-- Digital Lending Apply: seed licence_application_templates.form_schema (ML-A2, NDT-A4, NDT-A5, DL-A2, DL-A3, DL-A4).
-- Idempotent (plain UPDATEs keyed by application_key + external_id). Requires 0101.
-- The same JSON is bundled in src/app/apply/digital-lending/dl-schemas.ts, which the
-- app falls back to when form_schema is empty, so editing it here is how admins tune
-- labels / required rules without a deploy. Block kinds are documented in dl-schemas.ts.

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "repeater",
   "key": "directors",
   "cardClass": "person-card",
   "itemLabel": "Director",
   "addLabel": "+ Add director",
   "cols": 2,
   "min": 1,
   "fields": [
    {
     "key": "name",
     "label": "Full name"
    },
    {
     "key": "phone",
     "label": "Phone"
    },
    {
     "key": "email",
     "label": "Email"
    },
    {
     "key": "address",
     "label": "Physical address"
    }
   ],
   "file": {
    "slotPrefix": "id-",
    "label": "Identity document",
    "hint": "Add the ID/passport evidence used for the application.",
    "required": true
   }
  },
  {
   "kind": "section",
   "title": "Company secretary",
   "mt": 22,
   "blocks": [
    {
     "kind": "person",
     "key": "secretary",
     "cardClass": "person-card",
     "title": "Company secretary",
     "cols": 2,
     "fields": [
      {
       "key": "name",
       "label": "Full name"
      },
      {
       "key": "phone",
       "label": "Phone"
      },
      {
       "key": "email",
       "label": "Email"
      },
      {
       "key": "address",
       "label": "Physical address"
      }
     ],
     "file": {
      "slotPrefix": "id-",
      "label": "Identity document",
      "hint": "Add the ID/passport evidence used for the application.",
      "required": true
     }
    }
   ]
  },
  {
   "kind": "check",
   "key": "allAdded",
   "label": "I have added all current directors.",
   "required": true
  },
  {
   "kind": "check",
   "key": "declarationsDone",
   "label": "I have completed the Form 1 fit/propriety declarations for the relevant people.",
   "required": true
  },
  {
   "kind": "upload",
   "slot": "goodconduct",
   "label": "Certificate of good conduct",
   "required": true
  }
 ],
 "save_label": "Save people",
 "caption": {
  "kind": "peopleML"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'ML-A2';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "section",
   "title": "Board members",
   "blocks": [
    {
     "kind": "repeater",
     "key": "board",
     "cardClass": "person-card",
     "itemLabel": "Board member",
     "addLabel": "+ Add board member",
     "cols": 2,
     "min": 1,
     "fields": [
      {
       "key": "name",
       "label": "Full name"
      },
      {
       "key": "designation",
       "label": "Designation"
      },
      {
       "key": "address",
       "label": "Address"
      },
      {
       "key": "otherDirectorships",
       "label": "Other directorships",
       "required": false
      },
      {
       "key": "appointmentDate",
       "label": "Appointment date",
       "type": "date",
       "required": true
      }
     ]
    }
   ]
  },
  {
   "kind": "section",
   "title": "Senior management",
   "blocks": [
    {
     "kind": "repeater",
     "key": "management",
     "cardClass": "person-card",
     "itemLabel": "Senior manager",
     "addLabel": "+ Add senior manager",
     "cols": 2,
     "min": 1,
     "fields": [
      {
       "key": "name",
       "label": "Full name"
      },
      {
       "key": "designation",
       "label": "Designation"
      },
      {
       "key": "nationality",
       "label": "Nationality"
      },
      {
       "key": "age",
       "label": "Age"
      },
      {
       "key": "qualifications",
       "label": "Qualifications"
      },
      {
       "key": "previousEmployment",
       "label": "Previous employment"
      },
      {
       "key": "appointmentDate",
       "label": "Appointment date",
       "type": "date",
       "required": true
      }
     ]
    }
   ]
  },
  {
   "kind": "check",
   "key": "allAdded",
   "label": "I have added all current board members and senior management.",
   "required": true
  }
 ],
 "save_label": "Save people",
 "caption": {
  "kind": "peopleNDT"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'NDT-A4';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "section",
   "title": "Has the institution been under receivership, compromised with creditors or failed to satisfy creditors in full?",
   "blocks": [
    {
     "kind": "choice",
     "key": "answers.receivership.value",
     "required": true,
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
      "key": "answers.receivership.value",
      "eq": "yes"
     },
     "mt": 10,
     "blocks": [
      {
       "kind": "fields",
       "cols": 1,
       "fields": [
        {
         "key": "answers.receivership.explanation",
         "label": "Provide details",
         "type": "textarea"
        }
       ]
      }
     ]
    }
   ]
  },
  {
   "kind": "section",
   "title": "Has the institution been the subject of an investigation in any country?",
   "blocks": [
    {
     "kind": "choice",
     "key": "answers.investigation.value",
     "required": true,
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
      "key": "answers.investigation.value",
      "eq": "yes"
     },
     "mt": 10,
     "blocks": [
      {
       "kind": "fields",
       "cols": 1,
       "fields": [
        {
         "key": "answers.investigation.explanation",
         "label": "Provide details",
         "type": "textarea"
        }
       ]
      }
     ]
    }
   ]
  },
  {
   "kind": "section",
   "title": "Is there current or expected litigation that may materially affect the institution’s resources?",
   "blocks": [
    {
     "kind": "choice",
     "key": "answers.litigation.value",
     "required": true,
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
      "key": "answers.litigation.value",
      "eq": "yes"
     },
     "mt": 10,
     "blocks": [
      {
       "kind": "fields",
       "cols": 1,
       "fields": [
        {
         "key": "answers.litigation.explanation",
         "label": "Provide details",
         "type": "textarea"
        }
       ]
      }
     ]
    }
   ]
  },
  {
   "kind": "section",
   "title": "Does the institution have business relationships with officers or significant shareholders that should be disclosed?",
   "blocks": [
    {
     "kind": "choice",
     "key": "answers.related.value",
     "required": true,
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
      "key": "answers.related.value",
      "eq": "yes"
     },
     "mt": 10,
     "blocks": [
      {
       "kind": "fields",
       "cols": 1,
       "fields": [
        {
         "key": "answers.related.explanation",
         "label": "Provide details",
         "type": "textarea"
        }
       ]
      }
     ]
    }
   ]
  }
 ],
 "save_label": "Save declarations"
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'NDT-A5';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "repeater",
   "key": "products",
   "cardClass": "product-card",
   "itemLabel": "Loan product",
   "addLabel": "+ Add loan product",
   "cols": 2,
   "min": 1,
   "fields": [
    {
     "key": "name",
     "label": "Product name"
    },
    {
     "key": "rate",
     "label": "Interest rate"
    },
    {
     "key": "tenure",
     "label": "Tenure"
    },
    {
     "key": "fees",
     "label": "Fees / charges"
    }
   ]
  },
  {
   "kind": "section",
   "title": "Product documents",
   "mt": 22,
   "blocks": [
    {
     "kind": "upload",
     "slot": "terms",
     "label": "Customer terms & conditions",
     "required": true
    },
    {
     "kind": "upload",
     "slot": "pricing",
     "label": "Pricing model & parameters",
     "required": true
    },
    {
     "kind": "when",
     "cond": {
      "route": "ml"
     },
     "blocks": [
      {
       "kind": "upload",
       "slot": "declaration",
       "label": "Loan Products & Interest Rates Declaration",
       "required": true
      }
     ]
    }
   ]
  }
 ],
 "save_label": "Save products",
 "caption": {
  "kind": "count",
  "key": "products",
  "noun": "product"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'DL-A2';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "repeater",
   "key": "sources",
   "cardClass": "fund-card",
   "itemLabel": "Funding source",
   "addLabel": "+ Add funding source",
   "cols": 1,
   "min": 1,
   "fields": [
    {
     "key": "name",
     "label": "Source / funder"
    },
    {
     "key": "description",
     "label": "Description",
     "type": "textarea"
    }
   ],
   "file": {
    "slotPrefix": "evidence-",
    "label": "Supporting evidence",
    "hint": "Add evidence supporting this source.",
    "required": true
   }
  }
 ],
 "save_label": "Save funding",
 "caption": {
  "kind": "count",
  "key": "sources",
  "noun": "funding source"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'DL-A3';

update public.licence_application_templates
   set form_schema = $json${
 "blocks": [
  {
   "kind": "upload",
   "slot": "agreement",
   "label": "Template lending agreement",
   "required": true
  },
  {
   "kind": "section",
   "title": "Agreement content check",
   "blocks": [
    {
     "kind": "checks",
     "required": true,
     "items": [
      {
       "key": "pricing",
       "label": "Interest, fees and charges"
      },
      {
       "key": "total",
       "label": "Total cost of credit"
      },
      {
       "key": "repayment",
       "label": "Repayment schedule and due dates"
      },
      {
       "key": "cooling",
       "label": "Cooling-off provision"
      },
      {
       "key": "security",
       "label": "Security / recovery / guarantor terms where applicable"
      },
      {
       "key": "early",
       "label": "Early-repayment rights"
      }
     ]
    }
   ]
  }
 ],
 "save_label": "Save check",
 "caption": {
  "kind": "files"
 }
}$json$::jsonb
 where application_key = 'digital_lending' and external_id = 'DL-A4';
