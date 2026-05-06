const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

class ApiService {
  async request(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
    
    return response.json();
  }
  
  // Accounts
  getAccounts() {
    return this.request('/accounts');
  }
  
  // Journals
  createJournal(data) {
    return this.request('/journals', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  getJournals(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/journals?${query}`);
  }
  
  postJournal(id) {
    return this.request(`/journals/${id}/post`, { method: 'POST' });
  }
  
  // Reports
  getTrialBalance(periodId) {
    return this.request(`/reports/trial-balance?periodId=${periodId}`);
  }
  
  getIncomeStatement(startDate, endDate) {
    return this.request(`/reports/income-statement?startDate=${startDate}&endDate=${endDate}`);
  }
  
  getIncomeStatement(startDate, endDate) {
    return this.request(`/reports/income-statement?startDate=${startDate}&endDate=${endDate}`);
  }

  getBalanceSheet(asOfDate) {
    return this.request(`/reports/balance-sheet?asOfDate=${asOfDate}`);
  }
  
  // Ledger
  getLedger(accountId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/journals/ledger/${accountId}?${query}`);
  }
}

export default new ApiService();
