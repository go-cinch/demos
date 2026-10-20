-- +migrate Up
-- Seed accounts, roles, user groups and other non-catalog defaults.
-- Assignment codes are resolved by the following action seed migration before startup completes.
INSERT INTO t_role (id, name, word, action) VALUES
    (1, 'Super', 'super', '54789SDK'),
    (2, 'Guest', 'guest', 'BTL37NTE'),
    (3, 'Admin', 'admin', 'HD9JR3QX,BTL37NTE,D8FCCT9N,CNR85MKV,HC35LMD4,4KEB8T8A,VT6WPYE4,TSTAPD3A,L3TFTYEM,RJD9E29H,YYRHPCLL,CME5KYHT,TGR3TCH7,EE4E3BED,DD69DNL3,BXTPRLMG,M26Y2SDR,X76W4LVT,WKM6YEHM,NLQNC29B,2KNW6DCF,SGV9FJHT,DXQ2XQV7,DQJQSC7N,F89K6AQ4'),
    (4, 'Developer', 'developer', 'HD9JR3QX,BTL37NTE,D8FCCT9N,CNR85MKV,HC35LMD4,4KEB8T8A,VT6WPYE4,TSTAPD3A,L3TFTYEM,RJD9E29H,YYRHPCLL,CME5KYHT,TGR3TCH7,EE4E3BED,DD69DNL3,BXTPRLMG,M26Y2SDR,X76W4LVT,4DAD99EB,XJHPNN2J,G3JN75S4,G4VT2NPG,WKM6YEHM,NLQNC29B,2KNW6DCF,SGV9FJHT,DXQ2XQV7,DQJQSC7N,F89K6AQ4,44EE66YW'),
    (5, 'Operator', 'operator', 'HD9JR3QX,DQJQSC7N');

-- Demo groups cover all ordinary admin pages, including workspace, dictionaries,
-- message management and both audit pages. Developer/catalog publishing remains
-- a separate capability of the Developer role, never implied by a demo tier.
-- Read Only: read. Read Write: read/create/update/delete. No Delete: read/create/update.
-- Personal account, inbox and session defaults remain assigned directly below.
INSERT INTO t_user_group (id, name, word, action) VALUES
    (1, 'Read Only', 'readonly', 'BTL37NTE,DQJQSC7N,D8FCCT9N,VT6WPYE4,YYRHPCLL,DD69DNL3,4DAD99EB,WKM6YEHM,SGV9FJHT,DXQ2XQV7'),
    (2, 'Read Write', 'write', 'BTL37NTE,DQJQSC7N,D8FCCT9N,CNR85MKV,HC35LMD4,4KEB8T8A,VT6WPYE4,TSTAPD3A,L3TFTYEM,RJD9E29H,YYRHPCLL,CME5KYHT,TGR3TCH7,EE4E3BED,DD69DNL3,BXTPRLMG,M26Y2SDR,X76W4LVT,4DAD99EB,XJHPNN2J,G3JN75S4,G4VT2NPG,WKM6YEHM,NLQNC29B,2KNW6DCF,SGV9FJHT,DXQ2XQV7'),
    (3, 'No Delete', 'nodelete', 'BTL37NTE,DQJQSC7N,D8FCCT9N,CNR85MKV,HC35LMD4,VT6WPYE4,TSTAPD3A,L3TFTYEM,YYRHPCLL,CME5KYHT,TGR3TCH7,DD69DNL3,BXTPRLMG,M26Y2SDR,4DAD99EB,XJHPNN2J,G3JN75S4,WKM6YEHM,NLQNC29B,SGV9FJHT,DXQ2XQV7');

-- Local seed credentials intentionally use the username as the password.
-- Preserve the finalized seed accounts; group defaults only affect future creation.
INSERT INTO t_user (id, role_id, username, code, password, status, action) VALUES
    (1, 1, 'super', 'EMMW3DXD', '$2a$10$Wx41MADqB3kuLD/bdD8DIeph55Oeo9HABKGt2p2ilqdkHAfZ7EGPm', 1, 'HD9JR3QX'),
    (2, 2, 'guest', '7EHLSN7A', '$2a$10$DzWbkb12WHoyj5UPIAdHBOYXFi6jn5gzQRUoOU8c6oZ9XJx9w6Tju', 1, 'HD9JR3QX'),
    (3, NULL, 'readonly', 'TADAQMC2', '$2a$10$e5bhTbZUo8JLBWOfxWY7A.BpiGCTgvV3PxIhPozM9UolwFuENjIZi', 1, 'HD9JR3QX'),
    (4, NULL, 'write', 'FK9A9VVX', '$2a$10$SB4cqKKE5t9ACvMXtHaJuOafN1nvJgdK.5XxVAITBCSsU.gSNTbAm', 1, 'HD9JR3QX'),
    (5, NULL, 'nodelete', '67VDGA8Q', '$2a$10$.QZNNNrOuEdPvV0UdYwEae942Bb7Hr28Zb0vrbBRocHUkSpqk/Uqu', 1, 'HD9JR3QX'),
    (6, 3, 'admin', 'AJ3CK4PJ', '$2a$10$30p0/2rXDEQMlENvObbsOOWEcQ/UtK7HwTnSph0OWg9YSXWWWADjm', 1, 'HD9JR3QX'),
    (7, 4, 'developer', '584NTLYY', '$2a$10$27TEL7BVoUIC1eBQaOsIueLPuoID2VA.2aIXAy4kcI5e3IaxwDIl.', 1, 'HD9JR3QX'),
    (8, 5, 'operator', '8ALK56DD', '$2a$10$ibw1wSobR/4DJhrPPey6.ekHt/1XuPwzf16D.MUpWQQHHz9k/yGJe', 1, 'HD9JR3QX');

INSERT INTO t_user_user_group_relation (user_id, user_group_id) VALUES
    (3, 1),
    (4, 2),
    (5, 3);

-- A fresh schema has no messages; initialize zero-count statistics for seed users.
INSERT INTO t_user_msg_status (user_id)
SELECT id
FROM t_user
ORDER BY id;

SELECT setval(pg_get_serial_sequence('t_role', 'id'), (SELECT MAX(id) FROM t_role), TRUE);
SELECT setval(pg_get_serial_sequence('t_user_group', 'id'), (SELECT MAX(id) FROM t_user_group), TRUE);
SELECT setval(pg_get_serial_sequence('t_user', 'id'), (SELECT MAX(id) FROM t_user), TRUE);

-- +migrate Down
-- Clear the non-catalog auth tables and reset their sequences.
TRUNCATE TABLE
    t_audit_event,
    t_user_msg_status,
    t_msg_recipient,
    t_msg,
    t_user_user_group_relation,
    t_user,
    t_user_group,
    t_role
RESTART IDENTITY;
