const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../src/index');

describe('Backend Incidents API', () => {
  const dummyImagePath = path.join(__dirname, 'test_image.jpg');

  beforeAll(() => {
    // Create a dummy image for multipart upload testing
    fs.writeFileSync(dummyImagePath, 'fake-binary-image-data-for-testing');
  });

  afterAll(() => {
    if (fs.existsSync(dummyImagePath)) {
      fs.unlinkSync(dummyImagePath);
    }
  });

  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('GET /api/incidents', () => {
    it('should return a paginated list of incidents matching schema', async () => {
      const res = await request(app).get('/api/incidents?page=1&limit=5');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeLessThanOrEqual(5);

      expect(res.body.pagination).toMatchObject({
        page: 1,
        limit: 5,
        total_items: expect.any(Number),
        total_pages: expect.any(Number)
      });

      if (res.body.data.length > 0) {
        const item = res.body.data[0];
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('description');
        expect(item).toHaveProperty('severity');
        expect(item).toHaveProperty('created_at');
        expect(item).toHaveProperty('updated_at');
      }
    });

    it('should support delta synchronization with last_synced_at parameter', async () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
      const res = await request(app).get(`/api/incidents?last_synced_at=${encodeURIComponent(futureDate)}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });
  });

  describe('POST /api/incidents (Sync Endpoint)', () => {
    it('should accept bulk incidents and return synced_incidents with server_ids', async () => {
      const payload = {
        incidents: JSON.stringify([
          {
            local_id: 'loc-test-1',
            description: 'Transformer spark observed during routine inspection',
            severity: 'High',
            latitude: 37.77,
            longitude: -122.42
          },
          {
            local_id: 'loc-test-2',
            description: 'Worn conveyor belt roller bearing',
            severity: 'Medium',
            latitude: 37.78,
            longitude: -122.41
          }
        ])
      };

      const res = await request(app)
        .post('/api/incidents')
        .field('incidents', payload.incidents);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('synced_incidents');
      expect(Array.isArray(res.body.synced_incidents)).toBe(true);
      expect(res.body.synced_incidents.length).toBe(2);

      const synced1 = res.body.synced_incidents.find(s => s.local_id === 'loc-test-1');
      expect(synced1).toBeDefined();
      expect(synced1.status).toBe('synced');
      expect(synced1.server_id).toBeDefined();
    });

    it('should handle multipart/form-data photo upload and return synced incident', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .field('incidents', JSON.stringify([
          {
            local_id: 'loc-with-photo-1',
            description: 'Damaged structural beam with photographic evidence',
            severity: 'Critical',
            latitude: 37.765,
            longitude: -122.43
          }
        ]))
        .attach('photo_loc-with-photo-1', dummyImagePath);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('synced_incidents');
      const synced = res.body.synced_incidents.find(s => s.local_id === 'loc-with-photo-1');
      expect(synced).toBeDefined();
      expect(synced.status).toBe('synced');

      // Verify stored record has photo_url populated
      const getRes = await request(app).get(`/api/incidents?limit=10`);
      const item = getRes.body.data.find(d => d.id === synced.server_id);
      if (item) {
        expect(item.photo_url).toMatch(/\/uploads\/incident-/);
      }
    });
  });
});
