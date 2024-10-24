import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockServer } from './mock-server';
import App from './App';
import { AuthProvider } from './AuthContext';

describe('Budget App Integration Tests', () => {
  let mockServer;

  beforeAll(async () => {
    mockServer = new MockServer();
    await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    mockServer.clearReceivedRequests();
    // Mock successful auth
    mockServer.stub('POST', '/api/auth/login', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'test-token', email: 'test@example.com' })
    });
  });

  describe('Authentication Flow', () => {
    test('successfully logs in and shows budget app', async () => {
      render(
        <AuthProvider>
          <App />
        </AuthProvider>
      );

      // Fill in login form
      await userEvent.type(screen.getByPlaceholderText(/email/i), 'test@example.com');
      await userEvent.type(screen.getByPlaceholderText(/password/i), 'password123');
      await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

      // Verify we're on the distribution tab
      await waitFor(() => {
        expect(screen.getByText(/distributions/i)).toBeInTheDocument();
      });
    });
  });

  describe('Distribution Tab', () => {
    beforeEach(() => {
      // Mock initial data
      mockServer.stub('GET', '/api/streams', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { id: 'msci', name: 'MSCI', amount: 4161.45 },
          { id: 'amway', name: 'Amway', amount: 48.55 }
        ])
      });

      mockServer.stub('GET', '/api/distributions', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msci: { wolcc: 10, savings: 5, investments: 60, taxes: 5, spending: 20 },
          amway: { wolcc: 20, savings: 40, spending: 40 }
        })
      });
    });

    test('adds new income stream', async () => {
      mockServer.stub('POST', '/api/streams', {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'new-stream', name: 'New Stream', amount: 1000 })
      });

      render(
        <AuthProvider>
          <App />
        </AuthProvider>
      );

      await userEvent.click(screen.getByText(/add income stream/i));
      
      const nameInput = screen.getByPlaceholderText(/stream name/i);
      const amountInput = screen.getByPlaceholderText(/amount/i);

      await userEvent.type(nameInput, 'New Stream');
      await userEvent.type(amountInput, '1000');

      // Verify the API call was made
      const requests = mockServer.getReceivedRequests();
      expect(requests).toContainEqual(expect.objectContaining({
        method: 'POST',
        url: '/api/streams'
      }));
    });

    test('updates distribution percentages', async () => {
      mockServer.stub('PUT', '/api/distributions', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
      });

      render(
        <AuthProvider>
          <App />
        </AuthProvider>
      );

      // Find MSCI stream's savings input
      const savingsInput = screen.getByDisplayValue('5');
      await userEvent.clear(savingsInput);
      await userEvent.type(savingsInput, '10');

      // Verify the API call
      await waitFor(() => {
        const requests = mockServer.getReceivedRequests();
        expect(requests).toContainEqual(expect.objectContaining({
          method: 'PUT',
          url: '/api/distributions'
        }));
      });
    });
  });

  describe('Monthly Budget Tab', () => {
    beforeEach(() => {
      mockServer.stub('GET', '/api/budgets', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'Dining & Drinks': {
            lastMonth: 668.14,
            thisMonth: { spent: 285.45, goal: 500.00 },
            isTracked: true,
            weeklySpent: 68.45,
            weeklyLimit: 116.28,
            bucket: 'spending'
          }
        })
      });
    });

    test('navigates to monthly tab and shows budgets', async () => {
      render(
        <AuthProvider>
          <App />
        </AuthProvider>
      );

      // Click monthly tab
      await userEvent.click(screen.getByText(/monthly overview/i));

      // Verify budget card is shown
      await waitFor(() => {
        expect(screen.getByText(/dining & drinks/i)).toBeInTheDocument();
        expect(screen.getByText('$500.00')).toBeInTheDocument();
      });
    });

    test('toggles weekly tracking for a category', async () => {
      mockServer.stub('POST', '/api/budgets/1/toggle_tracking', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isTracked: false })
      });

      render(
        <AuthProvider>
          <App />
        </AuthProvider>
      );

      await userEvent.click(screen.getByText(/monthly overview/i));
      const checkbox = screen.getByRole('checkbox');
      await userEvent.click(checkbox);

      // Verify API call
      await waitFor(() => {
        const requests = mockServer.getReceivedRequests();
        expect(requests).toContainEqual(expect.objectContaining({
          method: 'POST',
          url: expect.stringContaining('/toggle_tracking')
        }));
      });
    });
  });

  describe('Weekly Tracking Tab', () => {
    beforeEach(() => {
      // Mock tracked categories data
      mockServer.stub('GET', '/api/budgets/weekly_tracking', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'Dining & Drinks': {
            weeklyLimit: 116.28,
            weeklySpent: 68.45
          }
        })
      });
    });

    test('adds new expense', async () => {
      mockServer.stub('POST', '/api/budgets/1/add_expense', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
      });

      render(
        <AuthProvider>
          <App />
        </AuthProvider>
      );

      // Navigate to weekly tab
      await userEvent.click(screen.getByText(/weekly tracking/i));

      // Click quick add button
      await userEvent.click(screen.getByRole('button', { name: /plus/i }));

      // Fill in expense details
      await userEvent.type(screen.getByPlaceholderText('0.00'), '25.50');
      await userEvent.click(screen.getByText('Dining & Drinks'));
      await userEvent.type(screen.getByPlaceholderText(/add a note/i), 'Lunch');
      await userEvent.click(screen.getByText(/save expense/i));

      // Verify API call
      await waitFor(() => {
        const requests = mockServer.getReceivedRequests();
        expect(requests).toContainEqual(expect.objectContaining({
          method: 'POST',
          url: expect.stringContaining('/add_expense'),
          body: expect.stringContaining('25.50')
        }));
      });
    });

    test('shows safe to spend amount', async () => {
      render(
        <AuthProvider>
          <App />
        </AuthProvider>
      );

      await userEvent.click(screen.getByText(/weekly tracking/i));

      // Verify safe to spend calculation is shown
      await waitFor(() => {
        expect(screen.getByText(/safe to spend today/i)).toBeInTheDocument();
        const safeAmount = (116.28 - 68.45) / 7; // simplified calculation
        expect(screen.getByText(`$${safeAmount.toFixed(2)}`)).toBeInTheDocument();
      });
    });
  });

  describe('Cross-Tab Interactions', () => {
    test('updates weekly tracking when toggling category in monthly view', async () => {
      render(
        <AuthProvider>
          <App />
        </AuthProvider>
      );

      // Start in monthly view
      await userEvent.click(screen.getByText(/monthly overview/i));
      await userEvent.click(screen.getByRole('checkbox'));

      // Switch to weekly view
      await userEvent.click(screen.getByText(/weekly tracking/i));

      // Verify category is no longer shown
      await waitFor(() => {
        expect(screen.queryByText('Dining & Drinks')).not.toBeInTheDocument();
      });
    });

    test('reflects new expenses in monthly view', async () => {
      render(
        <AuthProvider>
          <App />
        </AuthProvider>
      );

      // Add expense in weekly view
      await userEvent.click(screen.getByText(/weekly tracking/i));
      await userEvent.click(screen.getByRole('button', { name: /plus/i }));
      await userEvent.type(screen.getByPlaceholderText('0.00'), '25.50');
      await userEvent.click(screen.getByText('Dining & Drinks'));
      await userEvent.click(screen.getByText(/save expense/i));

      // Check monthly view
      await userEvent.click(screen.getByText(/monthly overview/i));

      // Verify updated amount
      await waitFor(() => {
        expect(screen.getByText('$310.95')).toBeInTheDocument(); // 285.45 + 25.50
      });
    });
  });
});
