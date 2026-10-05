-- Payments Apply (payments_nps): item applicability (applies_to) and design item order. Requires 0201.
-- applies_to schema: {"routes_any":[pso|psp|instrument], "emi":true, "facts":{key:bool}, "min_capital_gt":0, "application_fee_gt":0}
-- ('{}' = always applies; routes_any = any of the derived licence routes; psp = any PSP class incl. EMI.)
-- route_key / applicability.fact_key are kept for the other applications but are no longer read for payments_nps.
begin;
update licence_application_templates set applies_to=$q${}$q$::jsonb where application_key='payments_nps' and external_id in ($q$C01$q$, $q$S05$q$, $q$S06$q$);
update licence_application_templates set applies_to=$q${"routes_any": ["pso", "psp"]}$q$::jsonb where application_key='payments_nps' and external_id in ($q$C02$q$, $q$C03$q$, $q$C04$q$, $q$C05$q$, $q$C07$q$, $q$F01$q$, $q$F02$q$, $q$F04$q$, $q$P01$q$, $q$P02$q$, $q$P03$q$, $q$P04$q$, $q$P05$q$, $q$P06$q$, $q$P07$q$, $q$P08$q$, $q$P09$q$, $q$B01$q$, $q$B03$q$, $q$B04$q$, $q$B06$q$, $q$B09$q$, $q$B10$q$, $q$B11$q$, $q$T01$q$, $q$T02$q$, $q$T03$q$, $q$T04$q$, $q$T05$q$, $q$T06$q$, $q$A01$q$, $q$A02$q$, $q$A03$q$, $q$S01$q$, $q$S07$q$, $q$L01$q$);
update licence_application_templates set applies_to=$q${"facts": {"foreign_corporate_shareholder": true}, "routes_any": ["pso", "psp"]}$q$::jsonb where application_key='payments_nps' and external_id in ($q$C06$q$);
update licence_application_templates set applies_to=$q${"routes_any": ["pso"]}$q$::jsonb where application_key='payments_nps' and external_id in ($q$G01$q$, $q$T11$q$);
update licence_application_templates set applies_to=$q${"emi": true}$q$::jsonb where application_key='payments_nps' and external_id in ($q$G03$q$, $q$L07$q$);
update licence_application_templates set applies_to=$q${"facts": {"fi_mdi": false}, "routes_any": ["instrument"]}$q$::jsonb where application_key='payments_nps' and external_id in ($q$F03$q$, $q$B02$q$);
update licence_application_templates set applies_to=$q${"facts": {"existing_psp_pso_licence": true, "fi_mdi": false}, "routes_any": ["instrument"]}$q$::jsonb where application_key='payments_nps' and external_id in ($q$G02$q$);
update licence_application_templates set applies_to=$q${"facts": {"foreign_resident_management": true}, "routes_any": ["pso", "psp"]}$q$::jsonb where application_key='payments_nps' and external_id in ($q$P10$q$);
update licence_application_templates set applies_to=$q${"min_capital_gt": 0, "routes_any": ["pso", "psp"]}$q$::jsonb where application_key='payments_nps' and external_id in ($q$B07$q$);
update licence_application_templates set applies_to=$q${"facts": {"electronic_platform": true}, "routes_any": ["pso", "psp"]}$q$::jsonb where application_key='payments_nps' and external_id in ($q$T07$q$, $q$T08$q$);
update licence_application_templates set applies_to=$q${"facts": {"outsourcing": true}, "routes_any": ["pso", "psp"]}$q$::jsonb where application_key='payments_nps' and external_id in ($q$T09$q$);
update licence_application_templates set applies_to=$q${"facts": {"payment_system_participation": true}, "routes_any": ["pso", "psp"]}$q$::jsonb where application_key='payments_nps' and external_id in ($q$T10$q$);
update licence_application_templates set applies_to=$q${"routes_any": ["instrument", "psp"]}$q$::jsonb where application_key='payments_nps' and external_id in ($q$A04$q$, $q$A05$q$);
update licence_application_templates set applies_to=$q${"facts": {"agents": true}, "routes_any": ["instrument", "pso", "psp"]}$q$::jsonb where application_key='payments_nps' and external_id in ($q$A06$q$);
update licence_application_templates set applies_to=$q${"facts": {"foreign_licences": true}, "routes_any": ["pso", "psp"]}$q$::jsonb where application_key='payments_nps' and external_id in ($q$S02$q$);
update licence_application_templates set applies_to=$q${"application_fee_gt": 0, "routes_any": ["pso", "psp"]}$q$::jsonb where application_key='payments_nps' and external_id in ($q$S03$q$);
-- B06: the design never gates it on a fact (the editor switches on established_business instead).
update licence_application_templates set applicability='{}'::jsonb where application_key='payments_nps' and external_id='B06';
-- Item order: the order the items first appear in the design (phases then follow first appearance, e.g. Forms & submission second).
update licence_application_templates t set seq=v.n from (values ('C01',1), ('C02',2), ('C03',3), ('C04',4), ('C05',5), ('C06',6), ('C07',7), ('G01',8), ('G03',9), ('F01',10), ('F02',11), ('F03',12), ('F04',13), ('G02',14), ('P01',15), ('P02',16), ('P03',17), ('P04',18), ('P05',19), ('P06',20), ('P07',21), ('P08',22), ('P09',23), ('P10',24), ('B01',25), ('B02',26), ('B03',27), ('B04',28), ('B06',29), ('B07',30), ('B09',31), ('B10',32), ('B11',33), ('T01',34), ('T02',35), ('T03',36), ('T04',37), ('T05',38), ('T06',39), ('T07',40), ('T08',41), ('T09',42), ('T10',43), ('T11',44), ('A01',45), ('A02',46), ('A03',47), ('A04',48), ('A05',49), ('A06',50), ('S01',51), ('S02',52), ('S03',53), ('S05',54), ('S06',55), ('S07',56), ('L01',57), ('L07',58)) as v(id,n) where t.application_key='payments_nps' and t.external_id=v.id;
commit;
