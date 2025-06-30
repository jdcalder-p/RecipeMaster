import { RequestHandler } from "express";
import admin from "firebase-admin";

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

export const verifyFirebaseToken: RequestHandler = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Add user info to request object
    (req as any).user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
    };

    // Ensure user exists in database
    try {
      const { storage } = await import("./storage");
      let user = await storage.getUser(decodedToken.uid);
      
      if (!user) {
        await storage.upsertUser({
          id: decodedToken.uid,
          email: decodedToken.email || null,
          firstName: decodedToken.name?.split(' ')[0] || null,
          lastName: decodedToken.name?.split(' ')[1] || null,
          profileImageUrl: decodedToken.picture || null,
        });
      }
    } catch (error) {
      console.error("Error ensuring user exists:", error);
    }

    next();
  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export { admin };