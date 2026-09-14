--
-- PostgreSQL database dump
--

\restrict xcbbsprGoGJ696CYm6YtHyxD8bE3CrbAx1Njt5jp8Q6FAmHorXzDXg4fElh8WQc

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: bands; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bands (id, name, slug, description, image_url, created_at) FROM stdin;
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categories (id, name, slug, created_at) FROM stdin;
1	Necklaces	necklaces	2026-09-09 09:52:05.133137+00
2	Pendants	pendants	2026-09-09 09:52:05.133137+00
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.products (id, name, slug, description, category_id, band_id, type, price, is_active, material, created_at, updated_at) FROM stdin;
2	Dean Blunt Pendant	dean-blunt-pendant	پلاک استیل دین بلانت	2	\N	pendant	350000.00	t	Stainless Steel	2026-09-09 09:52:05.133137+00	2026-09-09 09:52:05.133137+00
4	Aphex Twin Pendant	aphex-twin-pendant	پلاک استیل Aphex Twin	2	\N	pendant	350000.00	t	Stainless Steel	2026-09-09 09:52:05.133137+00	2026-09-09 20:35:32.438+00
1	Necklace	necklace	گردنبند استیل	1	\N	necklace	200000.00	t	Stainless Steel	2026-09-09 09:52:05.133137+00	2026-09-10 13:01:30.995+00
3	Cross Pendant	cross-pendant	پلاک استیل صلیب	2	\N	pendant	350000.00	t	Stainless Steel	2026-09-09 09:52:05.133137+00	2026-09-10 13:01:39.966+00
\.


--
-- Data for Name: product_variants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_variants (id, product_id, size, sku, stock, price, created_at, updated_at) FROM stdin;
2	2	One Size	DEAN-BLUNT-001	1	350000.00	2026-09-09 09:52:05.133137+00	2026-09-09 09:52:05.133137+00
4	4	One Size	APHEX-TWIN-001	1	350000.00	2026-09-09 09:52:05.133137+00	2026-09-09 09:52:05.133137+00
1	1	One Size	NECKLACE-001	7	200000.00	2026-09-09 09:52:05.133137+00	2026-09-09 09:52:05.133137+00
3	3	One Size	CROSS-PENDANT-001	0	350000.00	2026-09-09 09:52:05.133137+00	2026-09-09 09:52:05.133137+00
\.


--
-- Data for Name: promo_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.promo_codes (id, code, discount_type, discount_value, minimum_order, max_uses, used_count, starts_at, expires_at, is_active, created_at) FROM stdin;
2	WELCOME10	percentage	10.00	300000.00	100	0	\N	\N	t	2026-09-09 21:39:58.697179+00
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.settings (id, tax_rate, shipping_fee, free_shipping_threshold, currency, created_at, updated_at) FROM stdin;
1	10.00	0.00	\N	IRT	2026-09-09 09:52:05.133137+00	2026-09-09 09:52:05.133137+00
\.


--
-- Name: bands_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.bands_id_seq', 1, false);


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.categories_id_seq', 2, true);


--
-- Name: product_variants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_variants_id_seq', 4, true);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.products_id_seq', 4, true);


--
-- Name: promo_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.promo_codes_id_seq', 2, true);


--
-- Name: settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.settings_id_seq', 1, true);


--
-- PostgreSQL database dump complete
--

\unrestrict xcbbsprGoGJ696CYm6YtHyxD8bE3CrbAx1Njt5jp8Q6FAmHorXzDXg4fElh8WQc

