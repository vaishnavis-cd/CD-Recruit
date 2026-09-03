import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface CreateKeycloakUserDto {
  email: string;
  name: string;
  role: string;
  tempPassword?: string;
  temporary?: boolean;
  requirePasswordChange?: boolean;
}

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private readonly keycloakUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly adminUser: string;
  private readonly adminPass: string;

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {
    this.keycloakUrl = process.env.KEYCLOAK_URL || "http://localhost:8080";
    this.realm = process.env.KEYCLOAK_REALM || "cd-recruit";
    this.clientId = process.env.KEYCLOAK_CLIENT_ID || "cd-recruit-api";
    this.clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || "cd-recruit-api-secret";
    this.adminUser = process.env.KEYCLOAK_ADMIN || "admin";
    this.adminPass = process.env.KEYCLOAK_ADMIN_PASSWORD || "admin";
  }

  /**
   * Acquire access token for Keycloak Admin REST API.
   */
  private async getAdminAccessToken(): Promise<string | null> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAt - 15000) {
      return this.cachedToken;
    }

    // 1. Try master realm password grant with admin credentials (trying configured pass, 'admin', 'changeme')
    const passwordCandidates = Array.from(new Set([this.adminPass, "admin", "changeme"].filter(Boolean)));
    for (const pass of passwordCandidates) {
      try {
        const tokenUrl = `${this.keycloakUrl}/realms/master/protocol/openid-connect/token`;
        const body = new URLSearchParams();
        body.append("grant_type", "password");
        body.append("client_id", "admin-cli");
        body.append("username", this.adminUser);
        body.append("password", pass);

        const res = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });

        if (res.ok) {
          const data = await res.json();
          this.cachedToken = data.access_token;
          this.tokenExpiresAt = Date.now() + (data.expires_in || 300) * 1000;
          return this.cachedToken;
        }
      } catch (err: any) {
        this.logger.debug(`Master token attempt with password failed: ${err.message}`);
      }
    }

    // 2. If master realm fails, try client_credentials on cd-recruit realm
    const secretCandidates = Array.from(new Set([this.clientSecret, "cd-recruit-api-secret", "changeme"].filter(Boolean)));
    for (const secret of secretCandidates) {
      try {
        const realmTokenUrl = `${this.keycloakUrl}/realms/${this.realm}/protocol/openid-connect/token`;
        const clientBody = new URLSearchParams();
        clientBody.append("grant_type", "client_credentials");
        clientBody.append("client_id", this.clientId);
        clientBody.append("client_secret", secret);

        const res = await fetch(realmTokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: clientBody.toString(),
        });

        if (res.ok) {
          const data = await res.json();
          this.cachedToken = data.access_token;
          this.tokenExpiresAt = Date.now() + (data.expires_in || 300) * 1000;
          return this.cachedToken;
        }
      } catch (err: any) {
        this.logger.debug(`Client credentials token attempt failed: ${err.message}`);
      }
    }

    this.logger.warn(`Keycloak is unreachable or credentials invalid at ${this.keycloakUrl}`);
    return null;
  }

  /**
   * Create user in Keycloak with optional temporary password and roles.
   */
  async createUser(dto: CreateKeycloakUserDto): Promise<{ keycloakUserId: string | null; synced: boolean }> {
    const token = await this.getAdminAccessToken();
    if (!token) {
      this.logger.warn(`Keycloak offline — fallback local ID generated for ${dto.email}`);
      return { keycloakUserId: null, synced: false };
    }

    try {
      const nameParts = dto.name.trim().split(" ");
      const firstName = nameParts[0] || dto.name;
      const lastName = nameParts.slice(1).join(" ") || "Staff";

      const credentials = dto.tempPassword
        ? [
            {
              type: "password",
              value: dto.tempPassword,
              temporary: dto.temporary === true,
            },
          ]
        : [];

      const requiredActions: string[] = [];
      if (dto.temporary === true && dto.requirePasswordChange === true) {
        requiredActions.push("UPDATE_PASSWORD");
      }

      const userPayload = {
        username: dto.email,
        email: dto.email,
        firstName,
        lastName,
        enabled: true,
        emailVerified: true,
        credentials,
        requiredActions,
      };

      const createRes = await fetch(`${this.keycloakUrl}/admin/realms/${this.realm}/users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userPayload),
      });

      if (createRes.status === 201) {
        // Retrieve ID from Location header or user query
        const locationHeader = createRes.headers.get("Location");
        let userId = locationHeader ? locationHeader.split("/").pop() || null : null;

        if (!userId) {
          userId = await this.findUserIdByEmail(dto.email, token);
        }

        if (userId) {
          await this.assignRealmRole(userId, dto.role, token);
        }

        this.logger.log(`Created Keycloak user ${dto.email} (ID: ${userId})`);
        return { keycloakUserId: userId, synced: true };
      } else if (createRes.status === 409) {
        // User already exists in Keycloak — fetch existing ID & ensure password/roles
        const existingId = await this.findUserIdByEmail(dto.email, token);
        if (existingId) {
          if (dto.tempPassword) {
            await this.resetUserPassword(existingId, dto.tempPassword, dto.temporary === true, token);
          }
          await this.assignRealmRole(existingId, dto.role, token);
        }
        return { keycloakUserId: existingId, synced: true };
      } else {
        const errText = await createRes.text();
        this.logger.warn(`Keycloak user creation returned ${createRes.status}: ${errText}`);
        return { keycloakUserId: null, synced: false };
      }
    } catch (err: any) {
      this.logger.error(`Error creating Keycloak user ${dto.email}: ${err.message}`);
      return { keycloakUserId: null, synced: false };
    }
  }

  /**
   * Reset / update user password in Keycloak.
   */
  async resetPassword(
    keycloakUserId: string,
    newPassword: string,
    temporary = false,
  ): Promise<boolean> {
    const token = await this.getAdminAccessToken();
    if (!token) return false;

    return this.resetUserPassword(keycloakUserId, newPassword, temporary, token);
  }

  private async resetUserPassword(
    userId: string,
    newPassword: string,
    temporary: boolean,
    token: string,
  ): Promise<boolean> {
    try {
      const res = await fetch(`${this.keycloakUrl}/admin/realms/${this.realm}/users/${userId}/reset-password`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "password",
          value: newPassword,
          temporary: temporary === true,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        this.logger.warn(`Failed to reset password for Keycloak user ${userId}: ${errText}`);
        return false;
      }

      if (!temporary) {
        await fetch(`${this.keycloakUrl}/admin/realms/${this.realm}/users/${userId}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requiredActions: [],
            emailVerified: true,
            enabled: true,
          }),
        });
      }

      this.logger.log(`Reset password for Keycloak user ${userId} (temporary: ${temporary})`);
      return true;
    } catch (err: any) {
      this.logger.error(`Error resetting password for user ${userId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Delete user from Keycloak.
   */
  async deleteUser(keycloakUserId: string): Promise<boolean> {
    const token = await this.getAdminAccessToken();
    if (!token) return false;

    try {
      const res = await fetch(`${this.keycloakUrl}/admin/realms/${this.realm}/users/${keycloakUserId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      return res.ok || res.status === 404;
    } catch (err: any) {
      this.logger.warn(`Failed to delete Keycloak user ${keycloakUserId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Assign a realm role (e.g. "admin", "recruiter") to a user.
   */
  private async assignRealmRole(userId: string, roleName: string, token: string): Promise<void> {
    try {
      const normalizedRole = roleName.toLowerCase() === "admin" ? "admin" : "recruiter";

      const roleRes = await fetch(`${this.keycloakUrl}/admin/realms/${this.realm}/roles/${normalizedRole}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!roleRes.ok) {
        this.logger.warn(`Role ${normalizedRole} not found in realm ${this.realm}`);
        return;
      }

      const role = await roleRes.json();

      await fetch(`${this.keycloakUrl}/admin/realms/${this.realm}/users/${userId}/role-mappings/realm`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([role]),
      });
    } catch (err: any) {
      this.logger.warn(`Failed to map role for user ${userId}: ${err.message}`);
    }
  }

  /**
   * Sync all staff records into Keycloak if missing.
   */
  async syncAllStaff(
    staffList: Array<{ id: string; name: string; email: string; role: string; keycloakUserId?: string | null }>,
  ): Promise<{ syncedCount: number; errorsCount: number }> {
    const token = await this.getAdminAccessToken();
    if (!token) return { syncedCount: 0, errorsCount: 0 };

    let syncedCount = 0;
    let errorsCount = 0;

    for (const staff of staffList) {
      try {
        const existingId = await this.findUserIdByEmail(staff.email, token);
        if (!existingId) {
          const res = await this.createUser({
            email: staff.email,
            name: staff.name,
            role: staff.role,
            tempPassword: "Password@123",
            temporary: false,
            requirePasswordChange: false,
          });
          if (res.synced) syncedCount++;
          else errorsCount++;
        } else {
          await this.resetUserPassword(existingId, "Password@123", false, token);
          await this.assignRealmRole(existingId, staff.role, token);
          syncedCount++;
        }
      } catch (err: any) {
        this.logger.warn(`Failed reconciling staff ${staff.email} to Keycloak: ${err.message}`);
        errorsCount++;
      }
    }

    if (syncedCount > 0) {
      this.logger.log(`Keycloak reconciliation complete: ${syncedCount} staff synced to Keycloak.`);
    }

    return { syncedCount, errorsCount };
  }

  private async findUserIdByEmail(email: string, token: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.keycloakUrl}/admin/realms/${this.realm}/users?email=${encodeURIComponent(email)}&exact=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const users = await res.json();
      return users.length > 0 ? users[0].id : null;
    } catch {
      return null;
    }
  }
}
