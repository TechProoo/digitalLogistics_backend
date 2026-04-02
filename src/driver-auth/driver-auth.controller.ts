import { Controller, Post, Body } from '@nestjs/common';
import { DriverAuthService } from './driver-auth.service';
import { DriverLoginDto } from './dto/driver-login.dto';

@Controller('driver-auth')
export class DriverAuthController {
  constructor(private readonly driverAuthService: DriverAuthService) {}

  @Post('login')
  login(@Body() dto: DriverLoginDto) {
    return this.driverAuthService.login(dto.email, dto.password);
  }

  @Post('set-password')
  setPassword(@Body() body: { driverId: string; password: string }) {
    return this.driverAuthService.setPassword(body.driverId, body.password);
  }

  @Post('change-password')
  changePassword(
    @Body() body: { driverId: string; currentPassword: string; newPassword: string },
  ) {
    return this.driverAuthService.changePassword(
      body.driverId,
      body.currentPassword,
      body.newPassword,
    );
  }
}
