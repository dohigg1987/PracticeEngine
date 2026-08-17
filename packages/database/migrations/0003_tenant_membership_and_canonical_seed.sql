BEGIN;

CREATE TABLE tenant_member(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  actor_id text NOT NULL,
  role_code text NOT NULL CHECK(role_code IN ('OWNER','ADMIN','MEMBER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,actor_id)
);
CREATE INDEX tenant_member_actor_idx ON tenant_member(actor_id,tenant_id);

INSERT INTO canonical_report_line(taxonomy_version,line_code,caption,statement_code,display_order) VALUES
('UK-CANONICAL-2026','BS.CASH','Cash at bank and in hand','BALANCE_SHEET',100),
('UK-CANONICAL-2026','BS.RECEIVABLES','Debtors','BALANCE_SHEET',110),
('UK-CANONICAL-2026','BS.PAYABLES','Creditors','BALANCE_SHEET',200),
('UK-CANONICAL-2026','BS.FIXED_ASSETS','Tangible fixed assets','BALANCE_SHEET',50),
('UK-CANONICAL-2026','PL.REVENUE','Turnover / income','PROFIT_AND_LOSS',10),
('UK-CANONICAL-2026','PL.COST_OF_SALES','Cost of sales / direct costs','PROFIT_AND_LOSS',20),
('UK-CANONICAL-2026','PL.ADMIN','Administrative / support costs','PROFIT_AND_LOSS',30),
('UK-CANONICAL-2026','PL.STAFF','Staff costs','PROFIT_AND_LOSS',40),
('UK-CANONICAL-2026','PL.DEPRECIATION','Depreciation','PROFIT_AND_LOSS',50)
ON CONFLICT(taxonomy_version,line_code) DO NOTHING;

INSERT INTO canonical_account(taxonomy_version,canonical_code,name,report_line,normal_balance,report_line_id)
SELECT 'UK-CANONICAL-2026',v.canonical_code,v.name,v.line_code,v.normal_balance,rl.id
FROM (VALUES
  ('ASSET.CASH','Cash and bank','BS.CASH','DEBIT'),
  ('ASSET.RECEIVABLES.TRADE','Trade debtors / receivables','BS.RECEIVABLES','DEBIT'),
  ('ASSET.RECEIVABLES.OTHER','Other debtors / receivables','BS.RECEIVABLES','DEBIT'),
  ('ASSET.FIXED.TANGIBLE','Tangible fixed assets','BS.FIXED_ASSETS','DEBIT'),
  ('LIABILITY.PAYABLES.TRADE','Trade creditors / payables','BS.PAYABLES','CREDIT'),
  ('LIABILITY.PAYABLES.OTHER','Other creditors / accruals','BS.PAYABLES','CREDIT'),
  ('REV.TRADING','Trading / service income','PL.REVENUE','CREDIT'),
  ('REV.DONATIONS','Donations and voluntary income','PL.REVENUE','CREDIT'),
  ('EXP.DIRECT','Direct / cost of sales','PL.COST_OF_SALES','DEBIT'),
  ('EXP.ADMIN','Administrative / support costs','PL.ADMIN','DEBIT'),
  ('EXP.STAFF','Staff costs','PL.STAFF','DEBIT'),
  ('EXP.DEPRECIATION','Depreciation','PL.DEPRECIATION','DEBIT')
) AS v(canonical_code,name,line_code,normal_balance)
JOIN canonical_report_line rl ON rl.taxonomy_version='UK-CANONICAL-2026' AND rl.line_code=v.line_code
ON CONFLICT(taxonomy_version,canonical_code) DO NOTHING;

COMMIT;
