/**
 * Representative OCR output for the document types the vault targets.
 * Modelled on real layouts, including the noise OCR typically introduces.
 */

export const CNIC_TEXT = `ISLAMIC REPUBLIC OF PAKISTAN
Computerized National Identity Card
NADRA
Name
MUHAMMAD AHMED KHAN
Father's Name
ABDUL KHAN
Date of Birth
15-03-1988
Gender
M
Date of Issue
01-09-2020
Date of Expiry
31-08-2030
42101-1234567-8
Personal Number 9283746`;

export const PASSPORT_TEXT = `ISLAMIC REPUBLIC OF PAKISTAN
PASSPORT
Type of Document P
Country Code PAK
Passport Number AB1234567
Surname KHAN
Given Names MUHAMMAD AHMED
Nationality PAKISTANI
Date of Birth 15 MAR 1988
Sex M
Place of Birth KARACHI
Date of Issue 01 APR 2021
Date of Expiry 31 MAR 2031
Authority MINISTRY OF INTERIOR
P<PAKKHAN<<MUHAMMAD<AHMED<<<<<<<<<<<<<<<<<<<<<
AB12345673PAK8803157M3103311<<<<<<<<<<<<<<02`;

export const UTILITY_BILL_TEXT = `LAHORE ELECTRIC SUPPLY COMPANY
LESCO - ELECTRICITY BILL
Consumer No: 0123456789
Address: HOUSE 42 STREET 7 DHA LAHORE
Billing Month: AUG 2026
Units Consumed: 450
Amount Due: Rs. 8750
Due Date: 25-09-2026
After Due Date Amount: Rs. 9100`;

export const BIRTH_CERTIFICATE_TEXT = `GOVERNMENT OF PUNJAB
BIRTH CERTIFICATE
Registration Number 2015/B/12345
Child Name FATIMA AHMED KHAN
Date of Birth 10 JAN 2015
Place of Birth LAHORE
Father Name MUHAMMAD AHMED KHAN
Mother Name AYESHA KHAN
Gender Female
This certificate is permanent and does not expire.`;

export const DEGREE_TEXT = `COMSATS UNIVERSITY ISLAMABAD
DEGREE CERTIFICATE
This is to certify that
FATIMA AHMED KHAN
has been awarded the degree of
BACHELOR OF SCIENCE IN COMPUTER SCIENCE
Roll Number SP20-BSE-045
CGPA 3.78
Division First Class
Year of Passing 2024`;

export const LEASE_TEXT = `RENT AGREEMENT / LEASE AGREEMENT
This agreement is made between
Landlord: MUHAMMAD AHMED KHAN
Tenant: BILAL RAZA
Property Address: APARTMENT 3B GULBERG III LAHORE
Monthly Rent: PKR 85000
Security Deposit: PKR 170000
Start Date: 01-10-2026
End Date: 30-09-2027
The tenant shall maintain the premises in good condition.`;

export const LAB_REPORT_TEXT = `CHUGHTAI LAB - LABORATORY REPORT
Patient Name: MUHAMMAD AHMED KHAN
Age / Sex: 38Y / M
Sample Collected On: 02-09-2026
Reported On: 03-09-2026
Test Name Result Reference Range
Haemoglobin 14.2 g/dL 13.5 - 17.5
Blood Group B Positive
Fasting Glucose 95 mg/dL 70 - 100
Total Cholesterol 210 mg/dL < 200`;

export const GIBBERISH_TEXT = `xkcd qzpl mwvb
!!! ??? ###
fjksdhf kjasdhfkj asdkjfh`;

/**
 * A clinic card: three labelled dates that are *not* an issue or expiry, plus
 * one bare ambiguous date with no label beside it. Invented throughout.
 */
export const CLINIC_VISIT_TEXT = `CITY FAMILY CLINIC - OUTPATIENT CARD
Patient Name: AYESHA SIDDIQUI
CNIC: 42101-9876543-2
Consulted on 12 September 2026
Prescription Date 12-09-2026
Next Appointment 03/11/2026
Follow up after 30 days
Review on 15-10-2026
Token paid 500
Valid 04/11/26`;

/** An insurance renewal notice: renewal and payment dates, neither is an expiry of the policy document itself. */
export const INSURANCE_TEXT = `PAKISTAN GENERAL INSURANCE - MOTOR POLICY RENEWAL NOTICE (sample)
Policy Number XA-5566778
Policy Holder: IMRAN BALOCH
Vehicle: White Civic, Registration LES-1234
Date of Issue 20-11-2025
Coverage until 19-11-2026
Renew before 30 November 2026
Premium Due Date 15/11/2026`;
