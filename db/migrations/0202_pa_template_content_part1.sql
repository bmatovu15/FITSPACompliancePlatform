-- Payments Apply (payments_nps): v7 content layer from the Beacon design (GUIDE / PRODUCT / CARD_NOTES / WORKSPACE_HIDDEN).
-- Idempotent data UPDATEs keyed on external_id. Requires 0201.
begin;
update licence_application_templates set
  card_title=$q$Applicant entity$q$, card_note=$q$Confirm the applicant entity and its eligibility.$q$, short_cta=$q$Confirm entity details$q$,
  guidance_long=$q$The licence applicant should be an eligible institution or company in Uganda for the proposed activity. A foreign company operating only through a Ugandan branch should not be treated as the normal licence applicant; the application should be made through an eligible locally incorporated entity.$q$, deliverable=$q$Confirmed eligible applicant entity and completed entity profile. No separate duplicate document is needed here.$q$,
  sources=$q$[{"text": "BoU NPS Licensing FAQs, 2022 — Q2 & Q6, PDF pp.1–2", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$entity$q$, product_config=$q${}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$C01$q$;
update licence_application_templates set
  card_title=$q$Company documents$q$, card_note=$q$Upload the company records used in the licence application.$q$, short_cta=$q$Add documents$q$,
  guidance_long=$q$The application should contain the corporate records needed to establish the applicant’s legal existence, constitutional documents, current ownership and governance information. These should be current and certified where required, and the details across the documents should be consistent.$q$, deliverable=$q$Current company-document pack: Certificate of Incorporation, Memorandum, Articles, current shareholding / return of allotment, director particulars, registered-office details and beneficial-ownership records, certified where required.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 3(2)(h), PDF p.5", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "BoU NPS Licensing FAQs, 2022 — Annex 1 item 9, PDF p.6", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$company_docs$q$, product_config=$q${}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$C02$q$;
update licence_application_templates set
  card_title=$q$Company objects$q$, card_note=NULL, short_cta=NULL,
  guidance_long=$q$The objects in the Memorandum should cover the regulated payment activities for which the licence is being sought. For a payment-system operator, the objects should align with the activities permitted under section 8(1) of the Act and with the licence class selected in the application.$q$, deliverable=$q$No separate upload. The Memorandum uploaded under Company documents should contain objects that cover the selected regulated activities.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 3(2)(a), PDF p.5", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "BoU NPS Licensing FAQs, 2022 — Annex 1 item 2, PDF p.4", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$embedded$q$, product_config=$q${}$q$::jsonb, workspace_hidden=true
where application_key='payments_nps' and external_id=$q$C03$q$;
update licence_application_templates set
  card_title=$q$Articles of Association$q$, card_note=NULL, short_cta=NULL,
  guidance_long=$q$The Articles should reflect the approval control that applies to relevant changes in substantial shareholding. The wording should be consistent with the current licensing expectation and with the statutory approval requirement for changes involving substantial shareholders.$q$, deliverable=$q$No separate upload. The Articles uploaded under Company documents should contain the relevant approval restriction.$q$,
  sources=$q$[{"text": "BoU Guidance on Licensing under the NPS Act, 2026 — Slide 9", "url": "https://docs.google.com/presentation/d/1xbFcGFaAGJhYlkWh_jSVuBhh59yZyR3B/edit?usp=drivesdk"}, {"text": "National Payment Systems Regulations, 2021 — Reg. 9(1)–(2), PDF p.10", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$embedded$q$, product_config=$q${}$q$::jsonb, workspace_hidden=true
where application_key='payments_nps' and external_id=$q$C04$q$;
update licence_application_templates set
  card_title=$q$Board resolution$q$, card_note=$q$Upload the board resolution authorising the application.$q$, short_cta=$q$Upload resolution$q$,
  guidance_long=$q$The board resolution should clearly authorise submission of the licence application and identify the licence category or categories being applied for. The resolution should be consistent with the application form and the selected licence route.$q$, deliverable=$q$Executed / registered board resolution authorising the licence application and identifying the applicable licence category or categories.$q$,
  sources=$q$[{"text": "BoU Guidance on Licensing under the NPS Act, 2026 — Slide 10", "url": "https://docs.google.com/presentation/d/1xbFcGFaAGJhYlkWh_jSVuBhh59yZyR3B/edit?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$upload$q$, product_config=$q${"accept": ".doc,.docx,.pdf"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$C05$q$;
update licence_application_templates set
  card_title=$q$Foreign corporate shareholder documents$q$, card_note=$q$Add the required documents for each foreign corporate shareholder.$q$, short_cta=$q$Add shareholder documents$q$,
  guidance_long=$q$Where a shareholder in the Ugandan applicant is a foreign company, its incorporation documents should be provided in notarised form. The documents should be sufficient to establish the foreign shareholder’s legal identity and should match the ownership information disclosed in the application.$q$, deliverable=$q$Notarised incorporation documents for each foreign corporate shareholder.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 3(2)(n), PDF p.6", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "BoU NPS Licensing FAQs, 2022 — Annex 1 item 15, PDF p.7", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$repeat_docs$q$, product_config=$q${}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$C06$q$;
update licence_application_templates set
  card_title=$q$Business premises$q$, card_note=$q$Record the business premises that will be available for inspection.$q$, short_cta=$q$Add premises details$q$,
  guidance_long=$q$The applicant should have a fixed, identifiable and suitable place of business that can be inspected before the licence is granted. The premises should be consistent with the nature of the proposed business and ready for the pre-grant inspection.$q$, deliverable=$q$Confirmed business-premises details and any supporting evidence needed to demonstrate inspection readiness.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 3(3), PDF p.7", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "BoU NPS Licensing FAQs, 2022 — Annex 1 item 26, PDF p.8", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$premises$q$, product_config=$q${}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$C07$q$;
update licence_application_templates set
  card_title=$q$Payment-system interoperability$q$, card_note=NULL, short_cta=NULL,
  guidance_long=$q$A payment system operated under a PSO licence should be capable of interoperating with other relevant payment systems in Uganda and, where applicable, internationally. The product and technical material should explain the interfaces, standards, integration points and operating arrangements that make this possible.$q$, deliverable=$q$No separate certificate. The interoperability explanation and supporting architecture / operating material should be included within the relevant product and technical documentation.$q$,
  sources=$q$[{"text": "National Payment Systems Act, 2020 (Cap. 59) — s.8(2), PDF p.11", "url": "https://drive.google.com/file/d/1TssAB7TOnkqpUjWWHs8dzWxteSlsU7AM/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$embedded$q$, product_config=$q${}$q$::jsonb, workspace_hidden=true
where application_key='payments_nps' and external_id=$q$G01$q$;
update licence_application_templates set
  card_title=$q$EMI legal structure$q$, card_note=$q$Confirm the legal entity that will carry the electronic-money activity.$q$, short_cta=$q$Confirm structure$q$,
  guidance_long=$q$Where the proposed structure requires a separate legal entity for electronic-money issuance, that entity should be established before the licence application is completed. The EMI entity should have its own incorporation and application records and should be the entity carrying the electronic-money activity.$q$, deliverable=$q$Resolved EMI legal structure and, where a separate EMI entity is required, its incorporation and application records.$q$,
  sources=$q$[{"text": "National Payment Systems Act, 2020 (Cap. 59) — s.48(1)–(2), PDF p.23", "url": "https://drive.google.com/file/d/1TssAB7TOnkqpUjWWHs8dzWxteSlsU7AM/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$emi_structure$q$, product_config=$q${}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$G03$q$;
update licence_application_templates set
  card_title=$q$Covering letter$q$, card_note=$q$Upload the signed covering letter for the application pack.$q$, short_cta=$q$Upload covering letter$q$,
  guidance_long=$q$The application pack should include a covering letter identifying the applicant and the licence application being submitted. The letter should be short, accurate and consistent with the applicant name, licence category or class and the documents in the submission pack.$q$, deliverable=$q$Signed final covering letter.$q$,
  sources=$q$[{"text": "NPS Application Forms, 2021 — Form A, supporting documents, PDF p.2", "url": "https://drive.google.com/file/d/1ig6A2a8Cvfmm2Qgr7cVgxBmSzgh7Bp_b/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$upload$q$, product_config=$q${"accept": ".doc,.docx,.pdf"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$F01$q$;
update licence_application_templates set
  card_title=$q$Form A$q$, card_note=$q$Download the official form, complete it and upload the commissioned copy.$q$, short_cta=$q$Download Form A / Upload completed Form A$q$,
  guidance_long=$q$Form A is the prescribed application form for a Payment System Operator and/or Payment Service Provider. The form should be completed accurately, indicate the correct licence category and class, remain consistent with the supporting documents and be commissioned as required before it is uploaded.$q$, deliverable=$q$Completed and commissioned Form A. Use the official NPS Application Forms.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 3(1), PDF p.5", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "BoU NPS Licensing FAQs, 2022 — Annex 1 item 1, PDF p.4", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}]$q$::jsonb, official_form=$q${"label": "Open official Form A", "url": "https://drive.google.com/file/d/1ig6A2a8Cvfmm2Qgr7cVgxBmSzgh7Bp_b/view?usp=drivesdk"}$q$::jsonb,
  product_type=$q$official_form$q$, product_config=$q${"form": "Form A"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$F02$q$;
update licence_application_templates set
  card_title=$q$Form C$q$, card_note=$q$Download the official form, complete it and upload the commissioned copy.$q$, short_cta=$q$Download Form C / Upload completed Form C$q$,
  guidance_long=$q$Form C is the prescribed application form for an eligible applicant seeking a payment-instrument licence. It should be completed consistently with the applicant details and the supporting documents required for the payment-instrument route, and commissioned as required before upload.$q$, deliverable=$q$Completed and commissioned Form C where the Form C route applies. Use the official NPS Application Forms.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 4(1)–(2), PDF p.8", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "NPS Application Forms, 2021 — Form C, PDF p.6", "url": "https://drive.google.com/file/d/1ig6A2a8Cvfmm2Qgr7cVgxBmSzgh7Bp_b/view?usp=drivesdk"}]$q$::jsonb, official_form=$q${"label": "Open official Form C", "url": "https://drive.google.com/file/d/1ig6A2a8Cvfmm2Qgr7cVgxBmSzgh7Bp_b/view?usp=drivesdk"}$q$::jsonb,
  product_type=$q$official_form$q$, product_config=$q${"form": "Form C"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$F03$q$;
update licence_application_templates set
  card_title=$q$Fit & Proper Form B$q$, card_note=$q$Upload a completed and commissioned Form B for each applicable person.$q$, short_cta=$q$Add completed Form B$q$,
  guidance_long=$q$A separate Form B should be completed for every person included in the fit-and-proper vetting process. The form captures personal information, employment and business history, other shareholdings and relevant criminal, regulatory, disciplinary, bankruptcy and related disclosures. The completed form should be commissioned before submission.$q$, deliverable=$q$A completed and commissioned Form B for each applicable person. Use the official NPS Application Forms.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 3(2)(j), PDF p.6", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "BoU Guidance on Licensing under the NPS Act, 2026 — Slide 16", "url": "https://docs.google.com/presentation/d/1xbFcGFaAGJhYlkWh_jSVuBhh59yZyR3B/edit?usp=drivesdk"}]$q$::jsonb, official_form=$q${"label": "Open official Form B", "url": "https://drive.google.com/file/d/1ig6A2a8Cvfmm2Qgr7cVgxBmSzgh7Bp_b/view?usp=drivesdk"}$q$::jsonb,
  product_type=$q$person_form$q$, product_config=$q${"form": "Form B"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$F04$q$;
update licence_application_templates set
  card_title=$q$Existing PSP / PSO licence$q$, card_note=$q$Upload the applicant’s current PSP or PSO licence.$q$, short_cta=$q$Upload licence$q$,
  guidance_long=$q$Where a payment-instrument applicant already holds a Payment Service Provider or Payment System Operator licence, a copy of the current issued licence should be included with the application. An application, approval letter or expired licence should not be used in place of the current licence.$q$, deliverable=$q$Copy of the current issued PSP or PSO licence.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 4(3)(a), PDF p.8", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$upload$q$, product_config=$q${"accept": ".pdf,.png,.jpg,.jpeg"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$G02$q$;
update licence_application_templates set
  card_title=$q$Ownership & beneficial ownership$q$, card_note=$q$Enter the ownership structure through to the ultimate beneficial owners.$q$, short_cta=$q$Add ownership details$q$,
  guidance_long=$q$The applicant should identify its substantial shareholders, including the individuals who ultimately own or control the company. The ownership structure should show direct shareholders and their ownership percentages and continue through any corporate ownership layers until the ultimate beneficial owners are identified. The ownership information should be consistent with the applicant’s corporate and shareholding records.$q$, deliverable=$q$Complete ownership structure showing direct shareholders, percentages, indirect corporate layers and ultimate beneficial owners, supported by the relevant shareholding records.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 3(2)(c), PDF p.5", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "BoU NPS Licensing FAQs, 2022 — Annex 1 item 4, PDF p.4", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$ownership$q$, product_config=$q${}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$P01$q$;
update licence_application_templates set
  card_title=$q$Directors & senior management$q$, card_note=$q$Add the directors and senior managers included in the application.$q$, short_cta=$q$Add directors & management$q$,
  guidance_long=$q$The application should identify the directors and senior managers responsible for the applicant, including their roles, nationality and qualifications. The same people should be used consistently across the governance structure, vetting documents and application forms.$q$, deliverable=$q$Complete directors and senior-management schedule with the required information for each person.$q$,
  sources=$q$[{"text": "NPS Application Forms, 2021 — Form A item 5, PDF p.1", "url": "https://drive.google.com/file/d/1ig6A2a8Cvfmm2Qgr7cVgxBmSzgh7Bp_b/view?usp=drivesdk"}, {"text": "BoU Guidance on Licensing under the NPS Act, 2026 — Slide 10", "url": "https://docs.google.com/presentation/d/1xbFcGFaAGJhYlkWh_jSVuBhh59yZyR3B/edit?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$people$q$, product_config=$q${}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$P02$q$;
update licence_application_templates set
  card_title=$q$CVs$q$, card_note=$q$Upload a current CV for each applicable person.$q$, short_cta=$q$Add CVs$q$,
  guidance_long=$q$A current and sufficiently detailed CV should be provided for every person subject to vetting. It should show the person’s relevant education and professional qualifications, employment history, responsibilities and referee contacts so that their experience and suitability can be assessed.$q$, deliverable=$q$Current CV for each applicable person, including referee contacts.$q$,
  sources=$q$[{"text": "BoU NPS Licensing FAQs, 2022 — Annex 1 item 4, PDF p.4", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}, {"text": "BoU Guidance on Licensing under the NPS Act, 2026 — Slide 16", "url": "https://docs.google.com/presentation/d/1xbFcGFaAGJhYlkWh_jSVuBhh59yZyR3B/edit?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$person_upload$q$, product_config=$q${"slots": [["cv", "CV"]], "accept": ".doc,.docx,.pdf"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$P03$q$;
update licence_application_templates set
  card_title=$q$Identity documents & photos$q$, card_note=$q$Upload identity evidence and a passport photo for each applicable person.$q$, short_cta=$q$Add identity documents$q$,
  guidance_long=$q$Each person subject to vetting should provide reliable proof of identity and a recent passport photograph. Ugandan individuals should use the applicable National ID evidence, while foreign individuals should use passport evidence. The identity details should match the information used elsewhere in the application and fit-and-proper documents.$q$, deliverable=$q$National ID or passport evidence, as applicable, plus a recent passport photograph for each applicable person.$q$,
  sources=$q$[{"text": "NPS Application Forms, 2021 — Form B personal information, PDF p.3", "url": "https://drive.google.com/file/d/1ig6A2a8Cvfmm2Qgr7cVgxBmSzgh7Bp_b/view?usp=drivesdk"}, {"text": "BoU Guidance on Licensing under the NPS Act, 2026 — Slide 17", "url": "https://docs.google.com/presentation/d/1xbFcGFaAGJhYlkWh_jSVuBhh59yZyR3B/edit?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$person_upload$q$, product_config=$q${"slots": [["id", "National ID / passport"], ["photo", "Passport photo"]], "accept": ".pdf,.png,.jpg,.jpeg"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$P04$q$;
update licence_application_templates set
  card_title=$q$Certificates of good conduct$q$, card_note=$q$Upload a current certificate of good conduct or police clearance for each applicable person.$q$, short_cta=$q$Add certificates$q$,
  guidance_long=$q$A current certificate of good conduct should be provided for each applicable person. For persons outside Uganda, an equivalent police clearance may be used where appropriate. Current licensing guidance indicates that the certificate should not be more than six months old.$q$, deliverable=$q$Current certificate of good conduct or accepted equivalent for each applicable person.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 3(2)(k), PDF p.6", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "BoU NPS Licensing FAQs, 2022 — Annex 1 item 12, PDF p.6", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$person_upload$q$, product_config=$q${"slots": [["good_conduct", "Certificate of good conduct / police clearance"]], "accept": ".pdf,.png,.jpg,.jpeg"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$P05$q$;
update licence_application_templates set
  card_title=$q$Credit-reference reports$q$, card_note=$q$Add the credit-reference evidence for each applicable person.$q$, short_cta=$q$Add credit reports$q$,
  guidance_long=$q$A credit-reference report should be provided for each applicable person in the vetting pack. Where a person is not registered with the relevant credit-reference bureau, that position should be stated clearly rather than leaving the requirement unresolved.$q$, deliverable=$q$Credit-reference report for each applicable person, or a clear non-registration statement where relevant.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 3(2)(l), PDF p.6", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "BoU NPS Licensing FAQs, 2022 — Annex 1 item 13, PDF p.6", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$person_credit$q$, product_config=$q${}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$P06$q$;
update licence_application_templates set
  card_title=$q$Personal tax clearance$q$, card_note=$q$Upload personal tax-clearance evidence for each applicable person.$q$, short_cta=$q$Add tax clearance$q$,
  guidance_long=$q$Current tax-clearance evidence should be provided for the persons covered by the licensing and vetting process. The evidence should clearly relate to the individual concerned and, for non-resident persons, the accepted equivalent from the relevant jurisdiction should be used where applicable.$q$, deliverable=$q$Current personal tax-clearance evidence for each applicable person.$q$,
  sources=$q$[{"text": "BoU NPS Licensing FAQs, 2022 — Annex 1 item 17, PDF p.7", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}, {"text": "BoU Guidance on Licensing under the NPS Act, 2026 — Slide 16", "url": "https://docs.google.com/presentation/d/1xbFcGFaAGJhYlkWh_jSVuBhh59yZyR3B/edit?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$person_upload$q$, product_config=$q${"slots": [["tax", "Tax-clearance evidence"]], "accept": ".pdf,.png,.jpg,.jpeg"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$P07$q$;
update licence_application_templates set
  card_title=$q$Recommendation letters$q$, card_note=$q$Upload two recommendation letters for each eligible person.$q$, short_cta=$q$Add recommendation letters$q$,
  guidance_long=$q$Two recommendation letters should be obtained for each eligible person in the vetting pack. The letters should identify the person being recommended, speak to their credibility, integrity or conduct, and provide enough information to identify and contact the referee.$q$, deliverable=$q$Two recommendation letters for each eligible person.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 3(2)(i), PDF p.6", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "BoU Guidance on Licensing under the NPS Act, 2026 — Slide 17", "url": "https://docs.google.com/presentation/d/1xbFcGFaAGJhYlkWh_jSVuBhh59yZyR3B/edit?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$person_upload$q$, product_config=$q${"slots": [["letter1", "Recommendation letter 1"], ["letter2", "Recommendation letter 2"]], "accept": ".doc,.docx,.pdf"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$P08$q$;
update licence_application_templates set
  card_title=$q$Source of funds$q$, card_note=$q$Record the source of investment funds and supporting evidence for each shareholder.$q$, short_cta=$q$Add source of funds$q$,
  guidance_long=$q$The source of the shareholders’ investment funds should be explained and supported with appropriate evidence. The source may include savings, salary, dividends or another legitimate source, but the explanation should show how the funds used for the investment are connected to that source.$q$, deliverable=$q$Source-of-funds explanation and supporting evidence for each applicable shareholder.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 3(2)(m), PDF p.6", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "BoU NPS Licensing FAQs, 2022 — Annex 1 item 14, PDF p.6", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$source_funds$q$, product_config=$q${}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$P09$q$;
update licence_application_templates set
  card_title=$q$Work permits$q$, card_note=$q$Upload work permits for the foreign resident directors or senior managers who require them.$q$, short_cta=$q$Add work permits$q$,
  guidance_long=$q$Foreign directors and senior managers who are resident and working in Uganda should provide a current work permit. The permit should match the individual identified in the application and remain valid at the time of submission.$q$, deliverable=$q$Current work permit for each triggered foreign resident director or senior manager.$q$,
  sources=$q$[{"text": "BoU NPS Licensing FAQs, 2022 — Annex 1 item 11, PDF p.6", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}, {"text": "BoU Guidance on Licensing under the NPS Act, 2026 — Slide 17", "url": "https://docs.google.com/presentation/d/1xbFcGFaAGJhYlkWh_jSVuBhh59yZyR3B/edit?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$person_upload$q$, product_config=$q${"slots": [["work_permit", "Work permit"]], "accept": ".pdf,.png,.jpg,.jpeg", "person_filter": "work_permit"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$P10$q$;
update licence_application_templates set
  card_title=$q$Product & operations description$q$, card_note=$q$Upload the product and operations description for the proposed service.$q$, short_cta=$q$Upload description$q$,
  guidance_long=$q$The product and operations description should explain what the service does, who uses it, how value or payment instructions move through the service, the parties involved and how the product fits the selected licence class. The technical description should also cover the relevant system architecture and operational arrangements, including software configuration and management, network capacity, maintenance and source-code management where applicable.$q$, deliverable=$q$Final product and operations description, including the relevant technical / operating information.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 3(2)(b), PDF p.5", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "BoU NPS Licensing FAQs, 2022 — Annex 1 item 3, PDF p.4", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$product_desc$q$, product_config=$q${"accept": ".doc,.docx,.pdf,.ppt,.pptx"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$B01$q$;
update licence_application_templates set
  card_title=$q$Payment-instrument description$q$, card_note=$q$Upload the description of the payment instrument.$q$, short_cta=$q$Upload description$q$,
  guidance_long=$q$The payment-instrument description should explain the type of instrument being issued and how it works in practice. It can cover the form of the instrument, intended users and use cases, how it is issued or activated, how transactions are initiated and any important operating features or controls.$q$, deliverable=$q$Final description of the payment instrument and how it operates.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 4(3)(b), PDF p.8", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$upload$q$, product_config=$q${"accept": ".doc,.docx,.pdf,.ppt,.pptx"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$B02$q$;
update licence_application_templates set
  card_title=$q$Business plan & financial projections$q$, card_note=$q$Add the business plan and three-year financial projections.$q$, short_cta=$q$Add business plan & projections$q$,
  guidance_long=$q$The business plan should show how the applicant intends to operate a sound and sustainable business over the first three years. It should cover the market and assumptions underlying the plan, the initiatives expected to achieve the projections, three-year financial forecasts, capital implications and the projected balance sheet. A fuller business-plan structure can also cover the business model, products, target customers, operations, organisation and implementation plan.$q$, deliverable=$q$Three-year business plan and supporting three-year financial projections / model.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 3(2)(d), PDF p.5", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "BoU NPS Licensing FAQs, 2022 — Annex 1 item 5, PDF pp.4–5", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}, {"text": "FITSPA NPS Compliance Guidance Tool, 2021 — Business Plan, PDF pp.26–27", "url": "https://drive.google.com/file/d/1XwwpCy0nYblJcnwrYfu3AyI59YPwrU5m/view?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$docpack$q$, product_config=$q${"slots": [["business_plan", "Business plan"], ["projections", "Financial projections / model"]], "accept": ".doc,.docx,.pdf,.xls,.xlsx"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$B03$q$;
update licence_application_templates set
  card_title=$q$Governance & management structure$q$, card_note=$q$Upload the governance and management structure.$q$, short_cta=$q$Add governance document$q$,
  guidance_long=$q$The governance material should show the organisation structure, board, management and key control functions, together with reporting and accountability lines. Internal Audit and Risk should have sufficient independence and authority, and the organisation chart should be consistent with the directors and senior-management information elsewhere in the application.$q$, deliverable=$q$Organisation chart and governance / management structure showing reporting and control-function lines.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 3(2)(e), PDF p.5", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "BoU NPS Licensing FAQs, 2022 — Annex 1 item 6, PDF p.5", "url": "https://drive.google.com/file/d/1N3KPi9K00srJyaCM7yElcs7RyirjjE0c/view?usp=drivesdk"}, {"text": "BoU Guidance on Licensing under the NPS Act, 2026 — Slide 10", "url": "https://docs.google.com/presentation/d/1xbFcGFaAGJhYlkWh_jSVuBhh59yZyR3B/edit?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$upload$q$, product_config=$q${"accept": ".doc,.docx,.pdf,.ppt,.pptx"}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$B04$q$;
update licence_application_templates set
  card_title=$q$Financial statements$q$, card_note=$q$Add the financial statements that match the applicant’s stage of business.$q$, short_cta=$q$Add financial statements$q$,
  guidance_long=$q$The financial statements should match the applicant’s stage of business. An established applicant should provide audited financial statements for the previous two years, while a new applicant should provide the applicable management accounts or pre-trading financial statements. The statements should allow the applicant’s financial position and capital position to be understood.$q$, deliverable=$q$Established applicant: audited financial statements for the previous two years. New applicant: applicable management accounts or pre-trading financial statements.$q$,
  sources=$q$[{"text": "National Payment Systems Regulations, 2021 — Reg. 3(2)(o), PDF p.6", "url": "https://drive.google.com/file/d/1zWo5-Js9kYXuZmQCTYZCQrJNQI__YpJh/view?usp=drivesdk"}, {"text": "BoU Guidance on Licensing under the NPS Act, 2026 — Slide 11", "url": "https://docs.google.com/presentation/d/1xbFcGFaAGJhYlkWh_jSVuBhh59yZyR3B/edit?usp=drivesdk"}]$q$::jsonb, official_form=NULL,
  product_type=$q$financials$q$, product_config=$q${}$q$::jsonb, workspace_hidden=false
where application_key='payments_nps' and external_id=$q$B06$q$;
commit;
