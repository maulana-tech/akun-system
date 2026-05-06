-- ============================================
-- TRIGGER: Auto-generate Journal Number
-- ============================================
CREATE OR REPLACE FUNCTION generate_journal_no()
RETURNS TRIGGER AS $$
DECLARE
    year_part VARCHAR(4);
    seq_num INTEGER;
BEGIN
    year_part := EXTRACT(YEAR FROM NEW.journal_date)::TEXT;
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(journal_no FROM 'JU-\d{4}-(\d+)') AS INTEGER)), 0) + 1
    INTO seq_num
    FROM journal_headers
    WHERE journal_no LIKE 'JU-' || year_part || '-%';
    
    NEW.journal_no := 'JU-' || year_part || '-' || LPAD(seq_num::TEXT, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_no ON journal_headers;
CREATE TRIGGER trg_journal_no
    BEFORE INSERT ON journal_headers
    FOR EACH ROW
    WHEN (NEW.journal_no IS NULL)
    EXECUTE FUNCTION generate_journal_no();

-- ============================================
-- TRIGGER: Validate Balance Before Posting
-- ============================================
CREATE OR REPLACE FUNCTION validate_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
    total_d DECIMAL(15,2);
    total_c DECIMAL(15,2);
BEGIN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO total_d, total_c
    FROM journal_details
    WHERE journal_id = NEW.id;
    
    IF total_d <> total_c THEN
        RAISE EXCEPTION 'Jurnal tidak balance! Debit: %, Kredit: %', total_d, total_c;
    END IF;
    
    NEW.total_debit := total_d;
    NEW.total_credit := total_c;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_balance ON journal_headers;
CREATE TRIGGER trg_validate_balance
    BEFORE UPDATE OF is_posted ON journal_headers
    FOR EACH ROW
    WHEN (NEW.is_posted = TRUE AND OLD.is_posted = FALSE)
    EXECUTE FUNCTION validate_journal_balance();

-- ============================================
-- TRIGGER: Posting to General Ledger
-- ============================================
CREATE OR REPLACE FUNCTION post_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    jd RECORD;
    running_balance DECIMAL(15,2);
    acc_normal VARCHAR(10);
BEGIN
    FOR jd IN 
        SELECT * FROM journal_details 
        WHERE journal_id = NEW.id 
        ORDER BY line_no
    LOOP
        -- Get normal balance
        SELECT normal_balance INTO acc_normal 
        FROM accounts WHERE id = jd.account_id;
        
        -- Calculate running balance
        SELECT balance INTO running_balance
        FROM general_ledger
        WHERE account_id = jd.account_id
        ORDER BY id DESC
        LIMIT 1;
        
        IF running_balance IS NULL THEN
            SELECT opening_balance INTO running_balance FROM accounts WHERE id = jd.account_id;
        END IF;
        
        -- Update balance based on normal balance
        IF acc_normal = 'DEBIT' THEN
            running_balance := running_balance + jd.debit - jd.credit;
        ELSE
            running_balance := running_balance + jd.credit - jd.debit;
        END IF;
        
        -- Insert to ledger
        INSERT INTO general_ledger (
            account_id, period_id, journal_id, transaction_date,
            description, debit, credit, balance, reference
        ) VALUES (
            jd.account_id, NEW.period_id, NEW.id, NEW.journal_date,
            jd.description, jd.debit, jd.credit, running_balance, NEW.journal_no
        );
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_ledger ON journal_headers;
CREATE TRIGGER trg_post_ledger
    AFTER UPDATE OF is_posted ON journal_headers
    FOR EACH ROW
    WHEN (NEW.is_posted = TRUE AND OLD.is_posted = FALSE)
    EXECUTE FUNCTION post_to_ledger();

-- Function to be called from controller
CREATE OR REPLACE FUNCTION post_journal_to_ledger(p_journal_id INTEGER)
RETURNS VOID AS $$
BEGIN
    UPDATE journal_headers SET is_posted = TRUE WHERE id = p_journal_id;
END;
$$ LANGUAGE plpgsql;
