export function pickStr(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

export function pickGstYes(source: Record<string, unknown>): boolean {
  const gstNumberPresent =
    pickStr(source, ["gstNumber", "gst_number", "gstnumber", "gst_no", "gstNo"]).trim().length > 0;
  if (gstNumberPresent) {
    return true;
  }

  const keys = [
    "gst_registered",
    "gstRegistered",
    "gstRegistration",
    "gst_registration",
    "hasGst",
    "has_gst",
    "gst",
    "isGst",
    "is_gst",
    "gstEnabled",
  ];
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value === 1;
    }
    if (typeof value === "string") {
      const lower = value.toLowerCase();
      if (lower === "no" || lower === "false" || lower === "0") {
        return false;
      }
      if (lower === "yes" || lower === "true" || lower === "1") {
        return true;
      }
    }
  }
  // Server payloads without any GST flag should not default to "GST: Yes".
  return false;
}

function pickDeclarationAccepted(source: Record<string, unknown>): boolean {
  const keys = [
    "declaration_accepted",
    "declarationAccepted",
    "consent_accepted",
    "consentAccepted",
  ];
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value === 1;
    }
    if (typeof value === "string") {
      const lower = value.trim().toLowerCase();
      if (lower === "1" || lower === "true" || lower === "yes") {
        return true;
      }
      if (lower === "0" || lower === "false" || lower === "no") {
        return false;
      }
    }
  }
  return true;
}

export type AssessorProfileFormValues = {
  consultantId: string;
  accountStatus: string;
  accountActivationDate: string;
  name: string;
  email: string;
  mobile: string;
  industryCategory: string;
  enrollmentDate: string;
  leadAssessor: string;
  assessorGrade: string;
  alternateMobile: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  pancardNumber: string;
  gstNumber: string;
  companyWebsiteDetails: string;
  linkedinProfile: string;
  gstYes: boolean;
  declarationAccepted: boolean;
  emergencyContactName: string;
  emergencyMobile: string;
  emergencyAddressLine1: string;
  emergencyAddressLine2: string;
  emergencyCity: string;
  emergencyState: string;
  emergencyPincode: string;
  bankName: string;
  accountNumber: string;
  branchName: string;
  ifscCode: string;
};

export function mapServerProfileToFormValues(
  source: Record<string, unknown>,
): AssessorProfileFormValues {
  return {
    consultantId: pickStr(source, ["consultant_id", "consultantId", "consultantid"]),
    accountStatus: pickStr(source, ["account_status", "accountStatus", "status"]),
    accountActivationDate: pickStr(source, [
      "account_activation_date",
      "accountActivationDate",
      "account_Activation_date",
      "accountActivatedDate",
      "account_activation_datetime",
      "accountActivationDatetime",
      "account_activated_at",
      "activated_at",
      "activation_date",
      "activationDate",
      "created_at",
      "createdAt",
      "updated_at",
      "updatedAt",
    ]),
    name: pickStr(source, ["name", "fullName", "full_name"]),
    email: pickStr(source, ["email", "emailAddress", "email_address"]),
    mobile: pickStr(source, ["mobile", "mobileNumber", "mobile_number", "phone", "phoneNumber"]),
    industryCategory: pickStr(source, [
      "industryCategory",
      "industry_category",
      "organization",
      "industry",
    ]),
    enrollmentDate: pickStr(source, ["enrollment_date", "enrollmentDate", "total_years_professional_experience"]),
    leadAssessor: pickStr(source, ["additional_professional_qualification", "additionalProfessionalQualification"]),
    assessorGrade: pickStr(source, ["assessor_grade", "assessorGrade", "grade", "educational_qualification"]),
    alternateMobile: pickStr(source, [
      "alternateMobile",
      "alternate_mobile",
      "alternatePhone",
      "alternate_phone",
    ]),
    addressLine1: pickStr(source, [
      "addressLine1",
      "address_line_1",
      "address1",
      "address_1",
    ]),
    addressLine2: pickStr(source, ["addressLine2", "address_line_2", "address2", "address_2"]),
    city: pickStr(source, ["city"]),
    state: pickStr(source, ["state", "stateName", "state_name"]),
    pincode: pickStr(source, ["pincode", "pinCode", "zip", "zipcode", "postalCode", "postal_code"]),
    pancardNumber: pickStr(source, [
      "pancardNumber",
      "pancard_number",
      "panNumber",
      "pan_number",
      "pan",
      "years_env_sustainability",
    ]),
    gstNumber: pickStr(source, ["gstNumber", "gst_number", "gstnumber", "gst_no", "gstNo", "areas_of_specialization"]),
    companyWebsiteDetails: pickStr(source, [
      "company_website_details",
      "companyWebsiteDetails",
      "website",
      "website_url",
    ]),
    linkedinProfile: pickStr(source, [
      "linkedin_profile",
      "linkedinProfile",
      "linkedin_url",
      "linked_in_profile",
    ]),
    gstYes: pickGstYes(source),
    declarationAccepted: pickDeclarationAccepted(source),
    emergencyContactName: pickStr(source, [
      "emergencyContactName",
      "emergency_contact_name",
      "emergencyName",
      "emergency_name",
    ]),
    emergencyMobile: pickStr(source, [
      "emergencyMobile",
      "emergency_mobile",
      "emergencyPhone",
      "emergency_phone",
    ]),
    emergencyAddressLine1: pickStr(source, [
      "emergencyAddressLine1",
      "emergency_address_line_1",
      "emergency_address1",
    ]),
    emergencyAddressLine2: pickStr(source, [
      "emergencyAddressLine2",
      "emergency_address_line_2",
      "emergency_address2",
    ]),
    emergencyCity: pickStr(source, ["emergencyCity", "emergency_city"]),
    emergencyState: pickStr(source, ["emergencyState", "emergency_state"]),
    emergencyPincode: pickStr(source, [
      "emergencyPincode",
      "emergency_pincode",
      "emergencyZip",
    ]),
    bankName: pickStr(source, ["bankName", "bank_name"]),
    accountNumber: pickStr(source, ["accountNumber", "account_number", "bankAccountNumber"]),
    branchName: pickStr(source, ["branchName", "branch_name"]),
    ifscCode: pickStr(source, ["ifscCode", "ifsc_code", "ifsc"]),
  };
}
