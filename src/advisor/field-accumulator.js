// src/advisor/field-accumulator.js
// Accumulates assessment fields through conversation

class AssessmentAccumulator {
  constructor() {
    this.fields = {
      cohort:                  { value: null, source: null },
      scope:                   { value: null, source: null },
      clinician_id:            { value: null, source: null },
      consent_record_id:       { value: null, source: null },
      model_version:           { value: null, source: null },
      confidence:              { value: 0.75, source: 'default' },
      data_quality:            { value: 'good', source: 'default' },
      model_count:             { value: 2, source: 'default' },
      population_size:         { value: 0, source: 'default' },
      patient_facing:          { value: false, source: 'default' },
      assessment_type:         { value: 'population_mortality', source: 'default' },
      regulatory_jurisdiction: { value: null, source: null },
      equity_flag:             { value: null, source: null },
      dissent_flag:            { value: false, source: 'default' },
    };

    this.consentGenerated = false;
    this.stopSignalled = false;
    this.turnCount = 0;
    this.lastGateSimulation = null;
  }

  update(fieldName, value, source = 'chat') {
    if (!(fieldName in this.fields)) return;
    this.fields[fieldName] = { value, source };
  }

  getFieldValues() {
    const body = {};
    for (const [key, { value }] of Object.entries(this.fields)) {
      if (value !== null && value !== undefined) body[key] = value;
    }
    return body;
  }

  getMissing() {
    const required = ['cohort', 'scope', 'clinician_id', 'consent_record_id', 'model_version'];
    return required.filter(f => {
      const v = this.fields[f];
      return !v || v.value === null || v.value === '' || v.source === 'default';
    });
  }

  needsEquityFlag() {
    return (this.fields.population_size?.value || 0) > 10000 && !this.fields.equity_flag?.value;
  }

  toSummary() {
    return Object.entries(this.fields)
      .filter(([_, v]) => v.value !== null && v.source !== 'default')
      .map(([k, v]) => `${k}: ${v.value} (${v.source})`)
      .join('\n');
  }
}

export { AssessmentAccumulator };
